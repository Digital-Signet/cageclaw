use super::runtime::{ContainerStats, ContainerStatus, RuntimeInfo};
use crate::config::AppConfig;
use bollard::container::{
    Config, CreateContainerOptions, ListContainersOptions, NetworkingConfig,
    RemoveContainerOptions, StartContainerOptions, StatsOptions, StopContainerOptions,
};
use bollard::image::CreateImageOptions;
use bollard::models::{EndpointSettings, HostConfig, Mount, MountTypeEnum, PortBinding};
use bollard::network::{ConnectNetworkOptions, CreateNetworkOptions};
use bollard::Docker;
use futures_util::StreamExt;
use rand::Rng;
use std::collections::HashMap;

const GATEWAY_PORT: u16 = 18790;
const PROXY_PORT: u16 = 18791;

const CONTAINER_NAME: &str = "cageclaw-openclaw";
const SIDECAR_NAME: &str = "cageclaw-proxy-bridge";
const NETWORK_NAME: &str = "cageclaw-isolated";
const DEFAULT_IMAGE: &str = "alpine/openclaw";
const DEFAULT_TAG: &str = "latest";

/// JS bridge injected into the OpenClaw UI HTML so the parent CageClaw
/// window can send chat messages via postMessage (used by "Allow" toast).
const BRIDGE_SCRIPT: &str = concat!(
    "window.addEventListener('message',function(e){",
    "if(!e.data||e.data.type!=='cageclaw-notify')return;",
    "var m=e.data.message;",
    "var t=document.querySelector('textarea')||document.querySelector('input[type=text]');",
    "if(!t)return;",
    "var D=t.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;",
    "var s=Object.getOwnPropertyDescriptor(D.prototype,'value').set;",
    "s.call(t,m);",
    "t.dispatchEvent(new Event('input',{bubbles:true}));",
    "t.dispatchEvent(new Event('change',{bubbles:true}));",
    "setTimeout(function(){",
    "t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));",
    "},100)",
    "});",
);

pub struct DockerRuntime {
    client: Docker,
}

impl DockerRuntime {
    pub async fn try_connect() -> Result<Self, anyhow::Error> {
        let client = Docker::connect_with_named_pipe_defaults()?;
        client.ping().await?;
        Ok(Self { client })
    }

    pub async fn info(&self) -> Result<RuntimeInfo, anyhow::Error> {
        let version = self.client.version().await?;
        Ok(RuntimeInfo {
            name: "docker".to_string(),
            version: version.version.unwrap_or_default(),
            api_version: version.api_version.unwrap_or_default(),
        })
    }

    /// Start the container and return the randomly-generated gateway token.
    pub async fn start_container(&mut self, config: &AppConfig) -> Result<String, anyhow::Error> {
        // Generate a random gateway token so only CageClaw's embedded
        // webview can authenticate with the OpenClaw Control UI.
        let gateway_token: String = rand::rng()
            .sample_iter(&rand::distr::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let image = format!(
            "{}:{}",
            config.openclaw_image.as_deref().unwrap_or(DEFAULT_IMAGE),
            config.openclaw_tag.as_deref().unwrap_or(DEFAULT_TAG)
        );

        // Pull image
        let mut pull_stream = self.client.create_image(
            Some(CreateImageOptions {
                from_image: image.clone(),
                ..Default::default()
            }),
            None,
            None,
        );
        while let Some(result) = pull_stream.next().await {
            result?;
        }

        // ── 1. Create isolated internal network (idempotent) ──────────
        let _ = self
            .client
            .create_network(CreateNetworkOptions {
                name: NETWORK_NAME,
                internal: true,
                driver: "bridge",
                ..Default::default()
            })
            .await; // ignore "already exists"

        // ── 2. Clean up old containers ────────────────────────────────
        let force_rm = Some(RemoveContainerOptions {
            force: true,
            ..Default::default()
        });
        let _ = self.client.remove_container(CONTAINER_NAME, force_rm.clone()).await;
        let _ = self.client.remove_container(SIDECAR_NAME, force_rm).await;

        // ── 3. Create & start the proxy-bridge sidecar ────────────────
        // Created on default bridge (so port publishing works), then
        // connected to the isolated network too. Forwards two ports:
        //   host:18790 → cageclaw-openclaw:18790  (inbound Control UI)
        //   isolated:18791 → host.docker.internal:18791 (outbound proxy)
        let sidecar_port = format!("{}/tcp", GATEWAY_PORT);
        let mut sidecar_port_bindings = HashMap::new();
        sidecar_port_bindings.insert(
            sidecar_port.clone(),
            Some(vec![PortBinding {
                host_ip: Some("127.0.0.1".to_string()),
                host_port: Some(GATEWAY_PORT.to_string()),
            }]),
        );

        // Inbound: HTTP reverse proxy that strips X-Frame-Options and
        // frame-ancestors CSP so the Tauri webview can embed the Control UI
        // in an iframe. Outbound: raw TCP forwarder for the HTTPS proxy.
        let sidecar_cmd = format!(
            concat!(
                "const http=require('http');const n=require('net');",
                "http.createServer((q,r)=>{{",
                "const opts={{hostname:'{oc}',port:{gw},path:q.url,method:q.method,headers:q.headers}};",
                "const p=http.request(opts,pr=>{{",
                "const h={{...pr.headers}};",
                "delete h['x-frame-options'];",
                "if(h['content-security-policy'])h['content-security-policy']=",
                "h['content-security-policy'].replace(/frame-ancestors[^;]*(;|$)/g,'');",
                "var ct=(h['content-type']||'');",
                "if(ct.includes('text/html')){{",
                "delete h['content-length'];",
                "r.writeHead(pr.statusCode,h);",
                "var b=[];pr.on('data',function(c){{b.push(c)}});",
                "pr.on('end',function(){{r.end(Buffer.concat(b).toString()+'<script>'+process.env.CB+'</script>')}});",
                "}}else{{r.writeHead(pr.statusCode,h);pr.pipe(r)}}",
                "}});",
                "p.on('error',e=>{{r.writeHead(502);r.end()}});",
                "q.pipe(p);",
                // Also handle WebSocket upgrade for the Control UI
                "}}).on('upgrade',(q,s,hd)=>{{",
                "const u=n.connect({gw},'{oc}');",
                "const rq=''+q.method+' '+q.url+' HTTP/1.1\\r\\n'",
                "+Object.entries(q.headers).map(([k,v])=>k+': '+v).join('\\r\\n')",
                "+'\\r\\n\\r\\n';",
                "u.write(rq);if(hd.length)u.write(hd);",
                "s.pipe(u);u.pipe(s);",
                "s.on('error',()=>{{}});u.on('error',()=>{{}});",
                "}}).listen({gw},'0.0.0.0',()=>console.log('[bridge] inbound :{gw} -> {oc}:{gw}'));",
                "n.createServer(s=>{{",
                "const c=n.connect({px},'host.docker.internal');",
                "s.pipe(c);c.pipe(s);",
                "s.on('error',()=>{{}});c.on('error',()=>{{}});",
                "}}).listen({px},'0.0.0.0',()=>console.log('[bridge] proxy :{px} -> host:{px}'));",
            ),
            gw = GATEWAY_PORT,
            px = PROXY_PORT,
            oc = CONTAINER_NAME,
        );

        self.client
            .create_container(
                Some(CreateContainerOptions {
                    name: SIDECAR_NAME,
                    ..Default::default()
                }),
                Config {
                    image: Some(image.clone()),
                    cmd: Some(vec![
                        "node".to_string(),
                        "-e".to_string(),
                        sidecar_cmd,
                    ]),
                    env: Some(vec![format!("CB={}", BRIDGE_SCRIPT)]),
                    exposed_ports: Some({
                        let mut ports = HashMap::new();
                        ports.insert(sidecar_port.clone(), HashMap::new());
                        ports.insert(format!("{}/tcp", PROXY_PORT), HashMap::new());
                        ports
                    }),
                    host_config: Some(HostConfig {
                        port_bindings: Some(sidecar_port_bindings),
                        extra_hosts: Some(vec![
                            "host.docker.internal:host-gateway".to_string(),
                        ]),
                        ..Default::default()
                    }),
                    ..Default::default()
                },
            )
            .await?;

        self.client
            .start_container(SIDECAR_NAME, None::<StartContainerOptions<String>>)
            .await?;

        // Attach sidecar to isolated network (it's already on bridge)
        self.client
            .connect_network(
                NETWORK_NAME,
                ConnectNetworkOptions::<&str> {
                    container: SIDECAR_NAME,
                    endpoint_config: EndpointSettings::default(),
                },
            )
            .await?;

        // ── 4. Build mounts from config ───────────────────────────────
        let mut mounts = Vec::new();

        // Persistent bind mount for OpenClaw data (API keys, settings, history).
        // Stored on the host so the user can see/manage their data and there
        // are no Docker volume permission issues.
        let data_dir = std::path::PathBuf::from(r"C:\Temp\cageclaw");
        std::fs::create_dir_all(&data_dir).ok();
        mounts.push(Mount {
            target: Some("/home/node/.openclaw".to_string()),
            source: Some(data_dir.to_string_lossy().to_string()),
            typ: Some(MountTypeEnum::BIND),
            ..Default::default()
        });

        for mount_cfg in &config.file_mounts {
            if mount_cfg.blocked {
                continue;
            }
            mounts.push(Mount {
                target: Some(mount_cfg.container_path.clone()),
                source: Some(mount_cfg.host_path.clone()),
                typ: Some(MountTypeEnum::BIND),
                read_only: Some(mount_cfg.read_only),
                ..Default::default()
            });
        }

        let mut tmpfs = HashMap::new();
        tmpfs.insert("/tmp".to_string(), "size=256m".to_string());

        // ── 5. Create hardened OpenClaw container on isolated network ─
        // No port bindings needed — sidecar handles inbound from host.
        // No DNS/extra_hosts overrides — internal network has no route
        // to the internet, so network-level isolation replaces DNS tricks.
        let host_config = HostConfig {
            mounts: Some(mounts),
            cap_drop: Some(vec!["ALL".to_string()]),
            security_opt: Some(vec!["no-new-privileges:true".to_string()]),
            readonly_rootfs: Some(true),
            memory: config.resource_limits.memory_mb.map(|mb| mb * 1024 * 1024),
            nano_cpus: config
                .resource_limits
                .cpu_cores
                .map(|c| (c * 1_000_000_000.0) as i64),
            tmpfs: Some(tmpfs),
            ..Default::default()
        };

        // Proxy env vars point to sidecar (reachable via Docker DNS on
        // the isolated network). This is the ONLY way out.
        let proxy_url = format!("http://{}:{}", SIDECAR_NAME, PROXY_PORT);
        let mut env: Vec<String> = config
            .env_vars
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();
        env.push(format!("HTTP_PROXY={}", proxy_url));
        env.push(format!("HTTPS_PROXY={}", proxy_url));
        env.push(format!("http_proxy={}", proxy_url));
        env.push(format!("https_proxy={}", proxy_url));
        env.push("NO_PROXY=127.0.0.1,localhost".to_string());
        env.push("no_proxy=127.0.0.1,localhost".to_string());

        self.client
            .create_container(
                Some(CreateContainerOptions {
                    name: CONTAINER_NAME,
                    ..Default::default()
                }),
                Config {
                    image: Some(image),
                    user: Some("1000:1000".to_string()),
                    cmd: Some(vec![
                        "sh".to_string(),
                        "-c".to_string(),
                        format!(
                            concat!(
                                "mkdir -p /home/node/.openclaw &&",
                                " printf '{{\"gateway\":{{\"auth\":{{\"mode\":\"token\",",
                                "\"token\":\"{tok}\"}},\"bind\":\"loopback\"}}}}' ",
                                " > /home/node/.openclaw/openclaw.json &&",
                                " cat > /home/node/CLAUDE.md << 'CLEOF'\n",
                                "# CageClaw Sandboxed Environment\n",
                                "\n",
                                "You are running inside a CageClaw sandbox container with network isolation.\n",
                                "\n",
                                "## Network rules\n",
                                "\n",
                                "- **DNS does not work** inside this container. This is by design — do not attempt to diagnose or fix DNS.\n",
                                "- All HTTP/HTTPS traffic is routed through an HTTP proxy that handles DNS resolution on the host.\n",
                                "- The proxy enforces a domain allowlist. If a domain is not on the list, the request will be blocked.\n",
                                "- When a request is blocked, the user is notified via the CageClaw UI and can allow the domain with one click.\n",
                                "- Once a domain is allowed, you will be told to retry. Just retry the request — it will work.\n",
                                "\n",
                                "## What NOT to do\n",
                                "\n",
                                "- Do not try to fix networking, DNS, or proxy issues.\n",
                                "- Do not suggest restarting Docker, WSL, or network services.\n",
                                "- Do not use `ping`, `nslookup`, `dig`, or direct socket connections to diagnose connectivity.\n",
                                "- If a request fails with a connection error, it is most likely a blocked domain — just tell the user which domain you need.\n",
                                "CLEOF\n",
                                " node openclaw.mjs gateway --allow-unconfigured",
                                " --token {tok} &",
                                " sleep 2 &&",
                                " node -e \"",
                                "const n=require('net');",
                                "n.createServer(s=>{{",
                                "const c=n.connect(18789,'127.0.0.1');",
                                "s.pipe(c);c.pipe(s);",
                                "s.on('error',()=>{{}});c.on('error',()=>{{}});",
                                "}}).listen(18790,'0.0.0.0',()=>console.log('[fwd] 0.0.0.0:18790 -> 127.0.0.1:18789'))\"",
                            ),
                            tok = gateway_token,
                        ),
                    ]),
                    env: Some(env),
                    host_config: Some(host_config),
                    // Place on isolated network — the ONLY reachable peer is
                    // the sidecar. Raw TCP to any external IP gets
                    // "Network unreachable".
                    networking_config: Some(NetworkingConfig {
                        endpoints_config: HashMap::from([(
                            NETWORK_NAME.to_string(),
                            EndpointSettings::default(),
                        )]),
                    }),
                    ..Default::default()
                },
            )
            .await?;

        // Start it
        self.client
            .start_container(CONTAINER_NAME, None::<StartContainerOptions<String>>)
            .await?;

        Ok(gateway_token)
    }

    pub async fn stop_container(&mut self) -> Result<(), anyhow::Error> {
        self.client
            .stop_container(CONTAINER_NAME, Some(StopContainerOptions { t: 10 }))
            .await?;

        // Clean up the sidecar
        let _ = self
            .client
            .stop_container(SIDECAR_NAME, Some(StopContainerOptions { t: 5 }))
            .await;
        let _ = self
            .client
            .remove_container(
                SIDECAR_NAME,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await;

        Ok(())
    }

    pub async fn container_status(&self) -> Result<ContainerStatus, anyhow::Error> {
        let mut filters = HashMap::new();
        filters.insert("name", vec![CONTAINER_NAME]);

        let containers = self
            .client
            .list_containers(Some(ListContainersOptions {
                all: true,
                filters,
                ..Default::default()
            }))
            .await?;

        if let Some(container) = containers.first() {
            let state = container.state.as_deref().unwrap_or("unknown");
            match state {
                "running" => Ok(ContainerStatus::Running),
                "exited" | "dead" => Ok(ContainerStatus::Stopped),
                "created" | "restarting" => Ok(ContainerStatus::Starting),
                _ => Ok(ContainerStatus::Error(format!("Unknown state: {}", state))),
            }
        } else {
            Ok(ContainerStatus::NotCreated)
        }
    }

    pub async fn container_stats(&self) -> Result<ContainerStats, anyhow::Error> {
        let mut stream = self.client.stats(
            CONTAINER_NAME,
            Some(StatsOptions {
                stream: false,
                one_shot: true,
            }),
        );

        if let Some(Ok(stats)) = stream.next().await {
            let cpu_delta = stats
                .cpu_stats
                .cpu_usage
                .total_usage
                .saturating_sub(stats.precpu_stats.cpu_usage.total_usage);
            let system_delta = stats
                .cpu_stats
                .system_cpu_usage
                .unwrap_or(0)
                .saturating_sub(stats.precpu_stats.system_cpu_usage.unwrap_or(0));
            let num_cpus = stats.cpu_stats.online_cpus.unwrap_or(1);

            let cpu_percent = if system_delta > 0 {
                (cpu_delta as f64 / system_delta as f64) * num_cpus as f64 * 100.0
            } else {
                0.0
            };

            let memory_mb = stats.memory_stats.usage.unwrap_or(0) as f64 / (1024.0 * 1024.0);
            let memory_limit_mb =
                stats.memory_stats.limit.unwrap_or(0) as f64 / (1024.0 * 1024.0);

            let (rx, tx) = stats
                .networks
                .as_ref()
                .map(|nets| {
                    nets.values()
                        .fold((0u64, 0u64), |(rx, tx), net| (rx + net.rx_bytes, tx + net.tx_bytes))
                })
                .unwrap_or((0, 0));

            Ok(ContainerStats {
                cpu_percent,
                memory_mb,
                memory_limit_mb,
                network_rx_bytes: rx,
                network_tx_bytes: tx,
                uptime_seconds: 0,
            })
        } else {
            Ok(ContainerStats::default())
        }
    }
}
