use crate::config::DomainRule;
use crate::database::{Database, NetworkEvent};
use bytes::Bytes;
use http_body_util::Full;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;

const DEFAULT_PROXY_PORT: u16 = 18791;

pub struct ProxyServer {
    allowed_domains: Arc<RwLock<Vec<DomainRule>>>,
    db: Arc<tokio::sync::Mutex<Database>>,
    port: u16,
}

impl ProxyServer {
    pub fn new(
        allowed_domains: Vec<DomainRule>,
        db: Arc<tokio::sync::Mutex<Database>>,
    ) -> Self {
        Self {
            allowed_domains: Arc::new(RwLock::new(allowed_domains)),
            db,
            port: DEFAULT_PROXY_PORT,
        }
    }

    pub fn allowed_domains(&self) -> Arc<RwLock<Vec<DomainRule>>> {
        self.allowed_domains.clone()
    }

    pub async fn run(self) -> Result<(), anyhow::Error> {
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], self.port));
        let listener = TcpListener::bind(addr).await?;
        println!("[proxy] listening on {}", addr);

        let allowed = self.allowed_domains;
        let db = self.db;

        loop {
            let (stream, peer) = listener.accept().await?;
            let io = TokioIo::new(stream);
            let allowed = allowed.clone();
            let db = db.clone();

            tokio::spawn(async move {
                let allowed = allowed.clone();
                let db = db.clone();

                let service = service_fn(move |req| {
                    handle_request(req, allowed.clone(), db.clone(), peer)
                });

                if let Err(e) = http1::Builder::new()
                    .preserve_header_case(true)
                    .title_case_headers(true)
                    .serve_connection(io, service)
                    .with_upgrades()
                    .await
                {
                    // Connection resets are normal
                    let msg = e.to_string();
                    if !msg.contains("connection reset")
                        && !msg.contains("broken pipe")
                        && !msg.contains("early eof")
                    {
                        eprintln!("[proxy] connection error: {}", e);
                    }
                }
            });
        }
    }
}

async fn handle_request(
    req: Request<hyper::body::Incoming>,
    allowed_domains: Arc<RwLock<Vec<DomainRule>>>,
    db: Arc<tokio::sync::Mutex<Database>>,
    _peer: std::net::SocketAddr,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    if req.method() == Method::CONNECT {
        handle_connect(req, allowed_domains, db).await
    } else {
        handle_http(req, allowed_domains, db).await
    }
}

/// Handle HTTPS CONNECT tunneling — this is where domain filtering happens.
/// We see the destination host (e.g. api.anthropic.com:443) but NOT the encrypted content.
async fn handle_connect(
    req: Request<hyper::body::Incoming>,
    allowed_domains: Arc<RwLock<Vec<DomainRule>>>,
    db: Arc<tokio::sync::Mutex<Database>>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let authority = req.uri().authority().cloned();
    let host = authority
        .as_ref()
        .map(|a| a.host().to_string())
        .unwrap_or_default();
    let port = authority.as_ref().and_then(|a| a.port_u16()).unwrap_or(443);
    let target = format!("{}:{}", host, port);

    let allowed = is_domain_allowed(&host, &allowed_domains).await;
    let action = if allowed { "allowed" } else { "blocked" };

    println!("[proxy] CONNECT {} → {}", target, action);

    // Log to database
    log_event(&db, &host, "CONNECT", &target, action).await;

    if !allowed {
        return Ok(Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Full::new(Bytes::from(format!(
                "CageClaw: {} is not in the domain allowlist",
                host
            ))))
            .unwrap());
    }

    // Spawn the tunnel after we send the 200 response
    tokio::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                let mut client = TokioIo::new(upgraded);
                match TcpStream::connect(&target).await {
                    Ok(mut server) => {
                        let _ =
                            tokio::io::copy_bidirectional(&mut client, &mut server).await;
                    }
                    Err(e) => {
                        eprintln!("[proxy] failed to connect to {}: {}", target, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("[proxy] upgrade failed: {}", e);
            }
        }
    });

    // Respond with 200 to tell the client the tunnel is established
    Ok(Response::new(Full::new(Bytes::new())))
}

/// Handle plain HTTP requests (non-CONNECT) — forward proxy mode.
async fn handle_http(
    req: Request<hyper::body::Incoming>,
    allowed_domains: Arc<RwLock<Vec<DomainRule>>>,
    db: Arc<tokio::sync::Mutex<Database>>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let host = req
        .uri()
        .host()
        .unwrap_or_else(|| {
            req.headers()
                .get("host")
                .and_then(|h| h.to_str().ok())
                .unwrap_or("unknown")
        })
        .to_string();

    let method = req.method().to_string();
    let url = req.uri().to_string();
    let allowed = is_domain_allowed(&host, &allowed_domains).await;
    let action = if allowed { "allowed" } else { "blocked" };

    println!("[proxy] {} {} → {}", method, url, action);

    log_event(&db, &host, &method, &url, action).await;

    if !allowed {
        return Ok(Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Full::new(Bytes::from(format!(
                "CageClaw: {} is not in the domain allowlist",
                host
            ))))
            .unwrap());
    }

    // For plain HTTP, forward the request via a new TCP connection
    let port = req.uri().port_u16().unwrap_or(80);
    let target = format!("{}:{}", host, port);

    match TcpStream::connect(&target).await {
        Ok(stream) => {
            let io = TokioIo::new(stream);
            let (mut sender, conn) = hyper::client::conn::http1::Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .handshake(io)
                .await
                .map_err(|e| {
                    eprintln!("[proxy] handshake failed: {}", e);
                    e
                })?;

            tokio::spawn(async move {
                if let Err(e) = conn.await {
                    eprintln!("[proxy] upstream connection error: {}", e);
                }
            });

            let resp = sender.send_request(req).await?;
            let (parts, body) = resp.into_parts();
            let body_bytes = http_body_util::BodyExt::collect(body)
                .await?
                .to_bytes();
            Ok(Response::from_parts(parts, Full::new(body_bytes)))
        }
        Err(e) => {
            eprintln!("[proxy] connect to {} failed: {}", target, e);
            Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Full::new(Bytes::from(format!("Failed to connect: {}", e))))
                .unwrap())
        }
    }
}

/// Check if a domain matches any allowed rule.
/// Supports exact match and wildcard prefix (e.g. "*.googleapis.com").
async fn is_domain_allowed(
    host: &str,
    allowed_domains: &Arc<RwLock<Vec<DomainRule>>>,
) -> bool {
    let rules = allowed_domains.read().await;
    for rule in rules.iter() {
        if !rule.allowed {
            continue;
        }
        if rule.pattern.starts_with("*.") {
            let suffix = &rule.pattern[1..]; // e.g. ".googleapis.com"
            if host.ends_with(suffix) || host == &rule.pattern[2..] {
                return true;
            }
        } else if rule.pattern == host {
            return true;
        }
    }
    false
}

async fn log_event(
    db: &Arc<tokio::sync::Mutex<Database>>,
    host: &str,
    method: &str,
    url: &str,
    action: &str,
) {
    let event = NetworkEvent {
        id: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
        direction: "outbound".to_string(),
        method: method.to_string(),
        url: url.to_string(),
        host: host.to_string(),
        status_code: None,
        action: action.to_string(),
        bytes_sent: None,
        bytes_received: None,
    };

    if let Ok(db) = db.try_lock() {
        let _ = db.insert_network_event(&event);
    }
}
