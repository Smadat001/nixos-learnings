import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#05080d;--s0:#080c12;--s1:#0d1219;--s2:#121820;--s3:#1a2230;
  --b0:#1e2736;--b1:#263040;--b2:#344558;--b3:#4a6075;
  --c:#4da6ff;--cd:#2563eb;--ca:rgba(77,166,255,0.12);--cb:rgba(77,166,255,0.22);
  --g:#34d058;--ga:rgba(52,208,88,0.10);
  --y:#f0b429;--ya:rgba(240,180,41,0.10);
  --r:#f87171;--ra:rgba(248,113,113,0.10);
  --p:#a78bfa;--pa:rgba(167,139,250,0.10);
  --o:#fb923c;--oa:rgba(251,146,60,0.10);
  --t1:#e8eef6;--t2:#8fa3bc;--t3:#4a6075;--t4:#2a3a50;
  --mono:'JetBrains Mono',monospace;--sans:'Inter',sans-serif;--head:'Space Grotesk',sans-serif;
  --r4:4px;--r6:6px;--r8:8px;
}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--t1);font-family:var(--sans);font-size:14px}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--b1);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:var(--b2)}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes pop{0%{transform:scale(.9);opacity:0}70%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}
@keyframes slideLeft{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes glow{0%,100%{box-shadow:0 0 6px var(--c)}50%{box-shadow:0 0 18px var(--c),0 0 36px var(--cd)}}
@keyframes scanline{from{transform:translateY(-100%)}to{transform:translateY(100vh)}}
.au{animation:fadeUp .25s ease both}
.ai{animation:fadeIn .2s ease both}
.ap{animation:pop .3s ease both}
.asl{animation:slideLeft .25s ease both}
button{cursor:pointer;font-family:var(--sans)}
a{color:var(--c);text-decoration:none}
`;

/* ─────────────────────────────────────────────────────────────
   ENGINE STATE
───────────────────────────────────────────────────────────── */
const mkState = () => ({
  images: {
    "nginx:alpine":       { id:"a1b2c3d4e5f6", size:"23.5 MB", created:"3 days ago",  layers:6, ports:["80/tcp"] },
    "alpine:latest":      { id:"b2c3d4e5f6a1", size:"7.3 MB",  created:"5 days ago",  layers:3, ports:[] },
    "postgres:15-alpine": { id:"c3d4e5f6a1b2", size:"64.2 MB", created:"1 day ago",   layers:9, ports:["5432/tcp"] },
    "redis:7-alpine":     { id:"d4e5f6a1b2c3", size:"29.1 MB", created:"2 days ago",  layers:5, ports:["6379/tcp"] },
    "node:20-alpine":     { id:"e5f6a1b2c3d4", size:"133 MB",  created:"4 days ago",  layers:8, ports:["3000/tcp"] },
    "python:3.12-alpine": { id:"f6a1b2c3d4e5", size:"57.8 MB", created:"6 days ago",  layers:7, ports:[] },
    "ubuntu:22.04":       { id:"a2b3c4d5e6f7", size:"77.8 MB", created:"1 week ago",  layers:5, ports:[] },
  },
  containers: {}, networks: {
    "podman": { id:"2f259bab93aa", driver:"bridge", subnet:"10.88.0.0/16", gateway:"10.88.0.1", internal:false, containers:[] }
  },
  volumes: {}, pods: {}, nextIp: 2,
});

const rndHex = (n=12) => Array.from({length:n},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
const rndIp  = s => `10.88.0.${s.nextIp}`;

/* ─── flag parser ─── */
function parseRunArgs(args){
  const f={name:null,detach:false,rm:false,it:false,ports:[],env:[],volumes:[],network:null,pod:null,userns:null,caps:[],restart:null,memory:null,label:[],image:null,cmd:[]};
  let imgFound=false;
  for(let i=0;i<args.length;i++){
    if(imgFound){f.cmd.push(args[i]);continue;}
    const a=args[i],nxt=args[i+1];
    switch(a){
      case"-d":case"--detach":f.detach=true;break;
      case"-it":case"-ti":case"-i":f.it=true;break;
      case"-t":break; // just tty, skip
      case"--rm":f.rm=true;break;
      case"--name":f.name=nxt;i++;break;
      case"-p":case"--publish":f.ports.push(nxt||"");i++;break;
      case"-e":case"--env":f.env.push(nxt||"");i++;break;
      case"-v":case"--volume":f.volumes.push(nxt||"");i++;break;
      case"--network":f.network=nxt;i++;break;
      case"--pod":f.pod=nxt;i++;break;
      case"--userns":f.userns=nxt;i++;break;
      case"--cap-drop":f.caps.push("drop:"+nxt);i++;break;
      case"--cap-add":f.caps.push("add:"+nxt);i++;break;
      case"--restart":f.restart=nxt;i++;break;
      case"--memory":case"-m":f.memory=nxt;i++;break;
      case"--label":case"-l":f.label.push(nxt||"");i++;break;
      case"-w":case"--workdir":case"--hostname":case"-h":case"--cpus":case"--user":case"-u":i++;break;
      case"--tmpfs":case"--security-opt":case"--entrypoint":i++;break;
      case"--read-only":case"--privileged":case"--no-healthcheck":case"--init":break;
      default:if(!a.startsWith("-")){f.image=a;imgFound=true;}
    }
  }
  return f;
}

/* ─── exec container-name parser ─── */
function parseExecName(T){
  // T = full tokens array. T[0]="podman" T[1]="exec"
  // skip flags after "exec" until we find a non-flag non-value token
  const flagsWithVal=new Set(["-e","--env","-w","--workdir","--user","-u"]);
  let i=2;
  while(i<T.length){
    const t=T[i];
    if(t==="-it"||t==="-ti"||t==="-i"||t==="-t"||t==="--interactive"||t==="--tty"){i++;continue;}
    if(flagsWithVal.has(t)){i+=2;continue;}
    if(t.startsWith("-")){i++;continue;} // unknown flag, skip
    return{name:t, cmd:T.slice(i+1).join(" ")};
  }
  return{name:null,cmd:""};
}

/* ─────────────────────────────────────────────────────────────
   CORE ENGINE
───────────────────────────────────────────────────────────── */
function engine(raw, state){
  const input = raw.trim();
  if(!input) return {state, out:[]};

  const T = input.match(/'[^']*'|"[^"]*"|\S+/g)||[];
  // strip surrounding quotes from tokens
  const uq = s => s.replace(/^['"]|['"]$/g,"");
  const TU = T.map(uq);

  const cmd=TU[0], sub=TU[1];
  const st = JSON.parse(JSON.stringify(state));
  const out=[];
  const L  =(t,k="out")=>out.push({t,k});
  const OK =(t)=>L(t,"ok");
  const ERR=(t)=>L(t,"err");
  const DIM=(t)=>L(t,"dim");
  const HDR=(t)=>L(t,"hdr");
  const SEC=(t)=>L(t,"sec");
  const INF=(t)=>L(t,"info");
  const WRN=(t)=>L(t,"warn");

  /* ── aliases ── */
  if(cmd==="clear") return {state:st, out:[{t:"__CLEAR__",k:"clear"}]};
  if(cmd==="ls")   { ERR("bash: ls: not a podman command"); DIM("Try: podman ps  or  podman images"); return {state:st,out}; }
  if(cmd==="exit") { DIM("(session reset)"); return {state:mkState(),out}; }

  /* ── help ── */
  if(cmd==="help"){
    L("","out");
    L("  ╔══════════════════════════════════════════════════════╗","bdr");
    L("  ║   PODMAN MASTERY LAB  ·  v4.9.3  ·  rootless mode  ║","bdr");
    L("  ╚══════════════════════════════════════════════════════╝","bdr");
    L("","out");
    SEC("  ─── IMAGES ───────────────────────────────────────");
    DIM("   podman pull <image[:tag]>          Pull from registry");
    DIM("   podman images  /  image ls         List local images");
    DIM("   podman build -t <tag> [-f <file>] .  Build image");
    DIM("   podman rmi [-f] <image>            Remove image");
    DIM("   podman image prune [-a]            Remove unused images");
    DIM("   podman tag <src> <dst>             Tag image");
    DIM("   podman push <image>                Push to registry");
    DIM("   podman save -o <file> <image>      Export to tar");
    DIM("   podman load -i <file>              Import from tar");
    DIM("   podman history <image>             Show layer history");
    DIM("   podman inspect <image|container>   JSON metadata");
    L("","out");
    SEC("  ─── CONTAINERS ───────────────────────────────────");
    DIM("   podman run [flags] <image> [cmd]   Run container");
    DIM("     -d              Detached / background");
    DIM("     -it             Interactive + tty");
    DIM("     --rm            Auto-remove on exit");
    DIM("     --name <n>      Assign name");
    DIM("     -p <h>:<c>      Port mapping (rootless: h>=1024)");
    DIM("     -e KEY=val      Environment variable");
    DIM("     -v <src>:<dst>[:Z] Volume / bind mount");
    DIM("     --network <n>   Attach to network");
    DIM("     --pod <name>    Add to pod");
    DIM("     --userns=keep-id Map host UID into container");
    DIM("     --cap-drop ALL  Drop all capabilities");
    DIM("   podman ps [-a]                     List containers");
    DIM("   podman stop [-t N] <name>...       Stop (SIGTERM→SIGKILL)");
    DIM("   podman start <name>...             Start stopped");
    DIM("   podman restart <name>              Restart");
    DIM("   podman kill [-s SIG] <name>        Send signal");
    DIM("   podman pause / unpause <name>      Freeze / thaw");
    DIM("   podman rm [-f] [-v] <name>...      Remove");
    DIM("   podman container prune             Remove all stopped");
    DIM("   podman exec [-it] <name> <cmd>     Run command in ctr");
    DIM("   podman logs [-f] [--tail N] <n>    View logs");
    DIM("   podman stats [--no-stream] [name]  Resource usage");
    DIM("   podman top <name>                  Processes");
    DIM("   podman port <name>                 Port mappings");
    DIM("   podman cp <src> <dst>              Copy files");
    DIM("   podman rename <old> <new>          Rename");
    DIM("   podman diff <name>                 Filesystem changes");
    DIM("   podman commit <name> <image>       Commit to image");
    DIM("   podman wait <name>                 Wait for exit");
    DIM("   podman events                      Stream events");
    L("","out");
    SEC("  ─── NETWORKS ─────────────────────────────────────");
    DIM("   podman network create [--subnet x] [--internal] <n>");
    DIM("   podman network ls / inspect / rm / prune");
    DIM("   podman network connect <net> <ctr>");
    DIM("   podman network disconnect <net> <ctr>");
    L("","out");
    SEC("  ─── VOLUMES ──────────────────────────────────────");
    DIM("   podman volume create/ls/inspect/rm/prune");
    DIM("   podman volume export -o <file> <vol>");
    DIM("   podman volume import <vol> <file>");
    L("","out");
    SEC("  ─── PODS ─────────────────────────────────────────");
    DIM("   podman pod create [--name n] [-p h:c]");
    DIM("   podman pod ls / inspect / stop / start / rm");
    DIM("   podman pod stats <name>");
    DIM("   podman generate kube <pod>         Export K8s YAML");
    DIM("   podman play kube <file>            Apply K8s YAML");
    L("","out");
    SEC("  ─── SYSTEM ───────────────────────────────────────");
    DIM("   podman version / info              Version + system info");
    DIM("   podman system info / df / prune    Resource mgmt");
    DIM("   podman login [registry]            Authenticate");
    DIM("   podman logout [registry]           Logout");
    DIM("   podman search <term>               Search images");
    DIM("   podman unshare [cmd]               Enter user namespace");
    DIM("   clear                              Clear terminal");
    L("","out");
    INF("  Tip: Tab to autocomplete, ↑↓ for history, Ctrl+L to clear");
    return {state:st, out};
  }

  if(cmd!=="podman"){
    ERR(`bash: ${cmd}: command not found`);
    DIM(`Hint: type 'help' to see all available commands`);
    return {state:st,out};
  }
  if(!sub){
    DIM("Usage: podman <command> [options]");
    DIM("Try:   podman help");
    return {state:st,out};
  }

  /* ── version ── */
  if(sub==="version"){
    OK("Client:       Podman Engine");
    DIM("Version:      4.9.3");DIM("API Version:  4.9.3");DIM("Go Version:   go1.21.6");
    DIM("Built:        Mon Mar 15 08:00:00 2024");DIM("OS/Arch:      linux/amd64");
    DIM("Rootless:     true");
    L("","out");
    OK("Server:       Podman Engine");
    DIM("Version:      4.9.3");DIM("API Version:  4.9.3");DIM("Go Version:   go1.21.6");
    DIM("Built:        Mon Mar 15 08:00:00 2024");DIM("OS/Arch:      linux/amd64");
    return {state:st,out};
  }

  /* ── info ── */
  if(sub==="info"){
    OK("host:");
    DIM("  arch: amd64");DIM("  buildahVersion: 1.34.0");
    DIM("  cgroupManager: systemd");DIM("  cgroupVersion: v2");
    DIM("  conmon:");DIM("    path: /usr/bin/conmon");DIM("    version: conmon version 2.1.10");
    DIM("  cpus: 8");DIM("  memFree: 12884901888");DIM("  memTotal: 16711741440");
    DIM("  os: linux");DIM("  rootless: true");
    DIM("  security:");DIM("    seccompEnabled: true");DIM("    selinuxEnabled: true");
    OK("store:");
    DIM("  configFile: /home/max/.config/containers/storage.conf");
    DIM("  graphDriverName: overlay");
    DIM("  graphRoot: /home/max/.local/share/containers/storage");
    DIM(`  imageStore: { number: ${Object.keys(st.images).length} }`);
    DIM(`  containerStore: { number: ${Object.keys(st.containers).length} }`);
    OK("registries:");
    DIM("  search: [docker.io, quay.io, registry.access.redhat.com]");
    return {state:st,out};
  }

  /* ── system subcommands ── */
  if(sub==="system"){
    const op=TU[2];
    if(op==="info") return engine("podman info",state);
    if(op==="df"){
      const usedImgs=new Set(Object.values(st.containers).map(c=>c.image));
      const totalImgSize=Object.keys(st.images).length*42;
      const unusedImgSize=(Object.keys(st.images).length-usedImgs.size)*42;
      HDR("TYPE         TOTAL  ACTIVE  SIZE         RECLAIMABLE");
      L(`Images       ${String(Object.keys(st.images).length).padEnd(7)}${String(usedImgs.size).padEnd(8)}${totalImgSize}MB        ${unusedImgSize}MB (${totalImgSize>0?Math.round(unusedImgSize/totalImgSize*100):0}%)`);
      L(`Containers   ${String(Object.keys(st.containers).length).padEnd(7)}${String(Object.values(st.containers).filter(c=>c.status.startsWith("Up")).length).padEnd(8)}${Object.keys(st.containers).length*12}MB        ${Object.keys(st.containers).filter(n=>!st.containers[n].status.startsWith("Up")).length*12}MB`);
      L(`Volumes      ${String(Object.keys(st.volumes).length).padEnd(7)}-       ${Object.keys(st.volumes).length*50}MB        0B`);
      return {state:st,out};
    }
    if(op==="prune"){
      const all=TU.includes("-a");
      const stoppedCtrs=Object.keys(st.containers).filter(n=>!st.containers[n].status.startsWith("Up")&&st.containers[n].status!=="Paused");
      stoppedCtrs.forEach(n=>{
        Object.values(st.networks).forEach(net=>{net.containers=(net.containers||[]).filter(c=>c!==n);});
        delete st.containers[n];
      });
      let removed=`Removed ${stoppedCtrs.length} stopped container(s).`;
      if(all){
        const usedImgs=new Set(Object.values(st.containers).map(c=>c.image));
        const unusedImgs=Object.keys(st.images).filter(k=>!usedImgs.has(k));
        unusedImgs.forEach(k=>delete st.images[k]);
        const unusedNets=Object.keys(st.networks).filter(n=>n!=="podman"&&!(st.networks[n].containers||[]).length);
        unusedNets.forEach(n=>delete st.networks[n]);
        const volCount=Object.keys(st.volumes).length;st.volumes={};
        removed+=` Removed ${unusedImgs.length} image(s). Removed ${unusedNets.length} network(s). Removed ${volCount} volume(s).`;
      }
      OK(removed);
      return {state:st,out};
    }
    ERR(`Error: unknown system subcommand: ${op||"(none)"}`);
    DIM("Available: podman system info / df / prune [-a]");
    return {state:st,out};
  }

  /* ── login / logout ── */
  if(sub==="login"){
    const reg=TU[2]||"docker.io";
    DIM(`Username: max`);DIM(`Password:`);OK(`Login Succeeded! Registry: ${reg}`);
    return {state:st,out};
  }
  if(sub==="logout"){
    const reg=TU[2]||"docker.io";OK(`Removed login credentials for ${reg}`);return {state:st,out};
  }

  /* ── search ── */
  if(sub==="search"){
    const term=TU[2]||"";
    HDR("INDEX       NAME                                DESCRIPTION                    STARS  OFFICIAL");
    [
      ["docker.io","docker.io/library/"+term,         "Official "+term+" image",       9999,"[OK]"],
      ["docker.io","docker.io/bitnami/"+term,         "Bitnami "+term+" image",        1240, ""],
      ["docker.io","docker.io/"+term+"/"+term+"-dev", "Dev variant",                   341,  ""],
      ["quay.io",  "quay.io/"+term+"/"+term,          "Quay "+term+" image",           88,   ""],
    ].forEach(([idx,name,desc,stars,off])=>{
      L(`${idx.padEnd(12)}${name.padEnd(40)}${desc.padEnd(35)}${String(stars).padEnd(7)}${off}`);
    });
    return {state:st,out};
  }

  /* ── pull ── */
  if(sub==="pull"){
    if(!TU[2]){ERR("Error: 'podman pull' requires an image name");DIM("Usage: podman pull <image[:tag]>");return {state:st,out};}
    const raw2=TU[2];
    const k=raw2.includes(":")?raw2:raw2+":latest";
    if(st.images[k]){
      DIM(`Getting image source signatures`);
      OK(`${k}: image is up to date`);
    } else {
      DIM(`Trying to pull ${k}...`);
      DIM(`Getting image source signatures`);
      DIM(`Copying blob sha256:${rndHex(8)} done  `);
      DIM(`Copying blob sha256:${rndHex(8)} done  `);
      DIM(`Copying config sha256:${rndHex(12)} done  `);
      DIM(`Writing manifest to image destination`);
      const s=Math.floor(Math.random()*200+10);
      st.images[k]={id:rndHex(12),size:s+" MB",created:"just now",layers:Math.floor(Math.random()*8+3),ports:[]};
      OK(`Successfully pulled ${k}`);
    }
    return {state:st,out};
  }

  /* ── images ── */
  if(sub==="images"||(sub==="image"&&TU[2]==="ls")){
    const fmt=TU.includes("--format");
    const showAll=TU.includes("-a")||TU.includes("--all");
    const quiet2=TU.includes("-q")||TU.includes("--quiet");
    const imgs=Object.entries(st.images);
    if(!imgs.length){DIM("(no images — try: podman pull nginx:alpine)");return {state:st,out};}
    if(quiet2){imgs.forEach(([,d])=>DIM("sha256:"+d.id));return {state:st,out};}
    HDR("REPOSITORY              TAG           IMAGE ID      CREATED         SIZE");
    imgs.forEach(([n,d])=>{
      const[repo,tag]=n.split(":");
      L(`${repo.padEnd(24)}${(tag||"latest").padEnd(14)}${d.id.slice(0,12)}  ${d.created.padEnd(16)}${d.size}`);
    });
    return {state:st,out};
  }

  /* ── image prune ── */
  if(sub==="image"&&TU[2]==="prune"){
    const all=TU.includes("-a");
    const used=new Set(Object.values(st.containers).map(c=>c.image));
    const rm=Object.keys(st.images).filter(k=>all?!used.has(k):false);
    // default prune removes dangling only (we simulate as "unused")
    if(!all&&!rm.length){DIM("No dangling images to prune. Use -a to remove all unused.");return {state:st,out};}
    let freed=0;
    rm.forEach(k=>{freed+=parseInt(st.images[k].size)||42;delete st.images[k];});
    OK(`Deleted ${rm.length} image(s), freed ${freed}MB`);
    return {state:st,out};
  }

  /* ── rmi ── */
  if(sub==="rmi"){
    const force=TU.includes("-f")||TU.includes("--force");
    const tgts=TU.slice(2).filter(t=>t!=="-f"&&t!=="--force");
    if(!tgts.length){ERR("Error: 'podman rmi' requires at least one argument");return {state:st,out};}
    tgts.forEach(raw2=>{
      const k=raw2.includes(":")?raw2:raw2+":latest";
      if(!st.images[k]){ERR(`Error: ${raw2}: image not known`);return;}
      const inUse=Object.values(st.containers).some(c=>c.image===k);
      if(inUse&&!force){ERR(`Error: image ${k} is used by a container. Use -f to force.`);return;}
      delete st.images[k];
      OK(`Untagged: ${k}`);
      DIM(`Deleted: sha256:${st.images[k]?.id||rndHex(12)}`);
    });
    return {state:st,out};
  }

  /* ── tag ── */
  if(sub==="tag"){
    const[src,dst]=TU.slice(2);
    if(!src||!dst){ERR("Usage: podman tag <source> <dest>");return {state:st,out};}
    const sk=src.includes(":")?src:src+":latest";
    if(!st.images[sk]){ERR(`Error: ${src}: image not known`);return {state:st,out};}
    st.images[dst]={...st.images[sk],created:"just now"};
    OK(`Tagged ${sk} → ${dst}`);
    return {state:st,out};
  }

  /* ── push ── */
  if(sub==="push"){
    const img=TU[2];if(!img){ERR("Error: 'podman push' requires an image name");return {state:st,out};}
    const k=img.includes(":")?img:img+":latest";
    if(!st.images[k]){ERR(`Error: ${img}: image not known`);return {state:st,out};}
    DIM(`Copying blob sha256:${rndHex(8)}  done  `);
    DIM(`Copying blob sha256:${rndHex(8)}  done  `);
    DIM(`Copying config sha256:${rndHex(12)}  done  `);
    DIM(`Writing manifest to image destination`);
    OK(`Successfully pushed ${k}`);
    return {state:st,out};
  }

  /* ── save ── */
  if(sub==="save"){
    const oIdx=TU.indexOf("-o");const f=oIdx>=0?TU[oIdx+1]:"image.tar";
    const img=TU[TU.length-1];
    if(!img||img==="-o"||img===f){ERR("Usage: podman save -o <file> <image>");return {state:st,out};}
    OK(`Image saved to ${f}`);
    return {state:st,out};
  }

  /* ── load ── */
  if(sub==="load"){
    const iIdx=TU.indexOf("-i");const f=iIdx>=0?TU[iIdx+1]:"(stdin)";
    DIM(`Getting image source signatures`);
    DIM(`Copying blob sha256:${rndHex(8)}  done  `);
    OK(`Loaded image(s) from ${f}`);
    return {state:st,out};
  }

  /* ── history ── */
  if(sub==="history"){
    const n=TU[2];if(!n){ERR("Usage: podman history <image>");return {state:st,out};}
    const k=n.includes(":")?n:n+":latest";
    if(!st.images[k]){ERR(`Error: ${n}: image not known`);DIM(`Available: ${Object.keys(st.images).join(", ")}`);return {state:st,out};}
    HDR("ID            CREATED       CREATED BY                                    SIZE     COMMENT");
    const cmds=["CMD [\"/docker-entrypoint.sh\"]","COPY file:abc . in /","RUN /bin/sh -c apk add --no-cache curl","RUN /bin/sh -c set -x && addgroup","COPY rootfs.tar.xz /","ADD check-platf.sh /"];
    for(let i=0;i<(st.images[k].layers||5);i++){
      const s=Math.floor(Math.random()*20+1);
      L(`${rndHex(12)}  3 days ago    ${cmds[i%cmds.length].padEnd(46)}${s}MB`);
    }
    return {state:st,out};
  }

  /* ── build ── */
  if(sub==="build"){
    const tIdx=TU.indexOf("-t");const tag=tIdx>=0?TU[tIdx+1]:"localhost/myimage:latest";
    const fIdx=TU.indexOf("-f");const cf=fIdx>=0?TU[fIdx+1]:"Containerfile";
    const steps=[
      `FROM alpine:latest AS base`,`LABEL maintainer="max@lab.io"`,
      `WORKDIR /app`,`COPY . .`,`RUN apk add --no-cache curl ca-certificates`,
      `RUN addgroup -S appgroup && adduser -S appuser -G appgroup`,
      `USER appuser`,`CMD ["/app/start.sh"]`
    ];
    DIM(`[1/${steps.length}] ${steps[0]}`);
    for(let i=1;i<steps.length;i++) DIM(`[${i+1}/${steps.length}] ${steps[i]}`);
    const size=Math.floor(Math.random()*30+10);
    st.images[tag]={id:rndHex(12),size:size+" MB",created:"just now",layers:steps.length,ports:[]};
    OK(`Successfully tagged ${tag}`);
    DIM(`Image: ${tag}  ID: sha256:${st.images[tag].id}  Size: ${size}MB`);
    return {state:st,out};
  }

  /* ── run ── */
  if(sub==="run"){
    const f=parseRunArgs(TU.slice(2));
    if(!f.image){ERR("Error: 'podman run' requires an image");DIM("Usage: podman run [flags] <image> [command]");return {state:st,out};}
    const imgKey=f.image.includes(":")?f.image:f.image+":latest";

    // auto-pull if missing
    if(!st.images[imgKey]){
      DIM(`Pulling ${imgKey}...`);
      const s=Math.floor(Math.random()*100+10);
      st.images[imgKey]={id:rndHex(12),size:s+" MB",created:"just now",layers:4,ports:[]};
      DIM(`Pulled ${imgKey} (${s}MB)`);
    }

    const name=f.name||"ctr_"+rndHex(6);
    if(st.containers[name]){ERR(`Error: container name "${name}" is already in use`);DIM(`Use 'podman rm ${name}' first or choose a different name`);return {state:st,out};}

    // network: pod takes priority, then explicit, then default
    let netName="podman";
    if(f.pod&&st.pods[f.pod]) netName="pod_net_"+f.pod;
    else if(f.network) netName=f.network;

    // verify network exists (unless it's a pod-internal or default)
    if(netName!=="podman"&&!f.pod&&!st.networks[netName]){
      ERR(`Error: network "${netName}" not found`);DIM(`Create it first: podman network create ${netName}`);return {state:st,out};
    }

    const ip=rndIp(st);st.nextIp++;

    // parse ports
    const ports={};
    f.ports.forEach(p=>{
      if(!p)return;
      const pts=p.split(":");
      if(pts.length===1){ports[pts[0]+"/tcp"]=pts[0];}
      else if(pts.length===2){ports[pts[1]+"/tcp"]=pts[0];}
      else if(pts.length===3){ports[pts[2]+"/tcp"]=`${pts[0]}:${pts[1]}`;}
    });

    const ctr={
      id:rndHex(12),image:imgKey,
      status:f.detach?"Up":(f.it?"Exited (0)":"Exited (0)"),
      created:"just now",ports,network:netName,ip,
      env:f.env,volumes:f.volumes,pod:f.pod||null,
      userns:f.userns,caps:f.caps,restart:f.restart,memory:f.memory,
    };

    if(!f.rm){
      st.containers[name]=ctr;
      if(st.networks[netName]&&!f.pod){
        st.networks[netName].containers=[...(st.networks[netName].containers||[]),name];
      }
      if(f.pod&&st.pods[f.pod]){
        if(!st.pods[f.pod].containers.includes(name))
          st.pods[f.pod].containers.push(name);
        st.pods[f.pod].status="Running";
      }
    }

    // simulate output
    if(imgKey.startsWith("hello-world")){
      L("","out");OK("Hello from Podman! 🎉");
      DIM("This message confirms your rootless container runtime works.");
      DIM(`Container UID 0 (root) → host UID ${1000+Math.floor(Math.random()*500)} via user namespace`);
      return {state:st,out};
    }

    const cmdStr=f.cmd.join(" ");
    if(f.detach){
      OK(ctr.id);
      if(f.restart) INF(`# Restart policy: ${f.restart}`);
      if(f.memory) INF(`# Memory limit: ${f.memory}`);
    } else if(f.it||(!f.detach&&!cmdStr)){
      OK(`[${name}] / #`);DIM("(simulated interactive shell — exit with: exit)");
    } else if(cmdStr.includes("id")){
      if(f.userns==="keep-id"){
        DIM("uid=1001(max) gid=1001(max) groups=1001(max),997(wheel)");
        INF("# --userns=keep-id: host UID 1001 mapped directly into container");
      } else {
        DIM("uid=0(root) gid=0(root) groups=0(root)");
        INF(`# Container UID 0 → host UID ${1000+Math.floor(Math.random()*500)} on host (user namespace)`);
      }
    } else if(cmdStr.includes("/proc/self/uid_map")){
      DIM("         0     100000      65536");
      INF("# Container UID 0 maps to host UID 100000 (start of subuid range)");
      INF("# 65536 UIDs available in the mapping");
    } else if(cmdStr.includes("env")||cmdStr.includes("printenv")){
      DIM("PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
      DIM(`HOSTNAME=${name}`);
      DIM("HOME=/root");
      f.env.forEach(e=>DIM(e));
    } else if(cmdStr.includes("uname")){
      DIM("Linux "+name+" 6.6.8-200.fc39.x86_64 #1 SMP PREEMPT_DYNAMIC Thu Jan 11 17:54:00 UTC 2024 x86_64 GNU/Linux");
    } else if(cmdStr.includes("date")){
      DIM(new Date().toUTCString());
    } else if(cmdStr.includes("ls")){
      DIM("app  bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var");
    } else {
      DIM(`Container ${name} ran and exited (0).`);
    }
    return {state:st,out};
  }

  /* ── ps ── */
  if(sub==="ps"){
    const all=TU.includes("-a")||TU.includes("--all");
    const fmtIdx=TU.indexOf("--format");const fmt=fmtIdx>=0?TU[fmtIdx+1]:null;
    const quiet=TU.includes("-q")||TU.includes("--quiet");
    const ctrs=Object.entries(st.containers).filter(([,c])=>all||c.status.startsWith("Up"));
    if(quiet){
      ctrs.forEach(([,c])=>DIM(c.id.slice(0,12)));
      return {state:st,out};
    }
    HDR("CONTAINER ID  IMAGE                   STATUS        PORTS                NAMES");
    if(!ctrs.length){
      DIM(all?"(no containers)":"(no running containers)");
      if(!all) INF("Tip: use 'podman ps -a' to show all containers including stopped");
      return {state:st,out};
    }
    ctrs.forEach(([n,c])=>{
      const pStr=Object.entries(c.ports||{}).map(([k,v])=>`${v}→${k}`).join(", ").slice(0,20);
      const k=c.status.startsWith("Up")?"ok":c.status==="Paused"?"info":"dim";
      L(`${c.id.slice(0,12)}  ${(c.image||"").slice(0,23).padEnd(24)}${c.status.padEnd(14)}${pStr.padEnd(21)}${n}`,k);
    });
    return {state:st,out};
  }

  /* ── stop ── */
  if(sub==="stop"){
    const tIdx=TU.indexOf("-t");
    const timeout=tIdx>=0?(parseInt(TU[tIdx+1])||10):10;
    const tgts=TU.slice(2).filter(t=>t!=="-t"&&t!==String(timeout));
    if(!tgts.length){ERR("Error: 'podman stop' requires at least one container name/id");return {state:st,out};}
    tgts.forEach(n=>{
      if(!st.containers[n]){ERR(`Error: no container with name or id "${n}" found`);return;}
      if(st.containers[n].status==="Exited (0)"||st.containers[n].status==="Exited (1)"){
        DIM(`${n} already stopped`);return;
      }
      st.containers[n].status="Exited (0)";OK(n);
    });
    return {state:st,out};
  }

  /* ── start ── */
  if(sub==="start"){
    const tgts=TU.slice(2).filter(t=>!t.startsWith("-"));
    if(!tgts.length){ERR("Error: 'podman start' requires at least one container name/id");return {state:st,out};}
    tgts.forEach(n=>{
      if(!st.containers[n]){ERR(`Error: no container with name or id "${n}" found`);return;}
      st.containers[n].status="Up";OK(n);
    });
    return {state:st,out};
  }

  /* ── restart ── */
  if(sub==="restart"){
    const n=TU[2];
    if(!n){ERR("Error: 'podman restart' requires a container name");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    DIM(`Restarting ${n}...`);st.containers[n].status="Up";OK(n);
    return {state:st,out};
  }

  /* ── kill ── */
  if(sub==="kill"){
    const sIdx=TU.indexOf("-s");const sig=sIdx>=0?TU[sIdx+1]:"KILL";
    const n=TU.find((t,i)=>i>1&&!t.startsWith("-")&&TU[i-1]!=="-s");
    if(!n){ERR("Usage: podman kill [-s SIGNAL] <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    if(!st.containers[n].status.startsWith("Up")&&st.containers[n].status!=="Paused"){
      ERR(`Error: container "${n}" is not running`);return {state:st,out};
    }
    if(sig==="KILL"||sig==="SIGKILL"||sig==="9"){st.containers[n].status="Exited (137)";}
    else if(sig==="HUP"||sig==="SIGHUP"||sig==="1"){DIM(`Sent SIGHUP to ${n}`);}
    else {DIM(`Sent SIG${sig} to ${n}`);}
    OK(n);return {state:st,out};
  }

  /* ── pause / unpause ── */
  if(sub==="pause"){
    const n=TU[2];
    if(!n){ERR("Usage: podman pause <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    if(!st.containers[n].status.startsWith("Up")){ERR(`Error: container "${n}" is not running`);return {state:st,out};}
    st.containers[n].status="Paused";OK(n);
    INF("# SIGSTOP sent to all container processes — CPU drops to 0, memory preserved");
    return {state:st,out};
  }
  if(sub==="unpause"){
    const n=TU[2];
    if(!n){ERR("Usage: podman unpause <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    if(st.containers[n].status!=="Paused"){ERR(`Error: container "${n}" is not paused`);return {state:st,out};}
    st.containers[n].status="Up";OK(n);
    return {state:st,out};
  }

  /* ── rm ── */
  if(sub==="rm"){
    const force=TU.includes("-f")||TU.includes("--force");
    const rmVols=TU.includes("-v");
    const tgts=TU.slice(2).filter(t=>t!=="-f"&&t!=="--force"&&t!=="-v");
    if(!tgts.length){ERR("Error: 'podman rm' requires at least one container name/id");return {state:st,out};}
    tgts.forEach(n=>{
      if(!st.containers[n]){ERR(`Error: no container with name or id "${n}" found`);return;}
      const running=st.containers[n].status.startsWith("Up")||st.containers[n].status==="Paused";
      if(running&&!force){ERR(`Error: container "${n}" is running. Use -f to force removal.`);return;}
      // cleanup refs
      Object.values(st.networks).forEach(net=>{net.containers=(net.containers||[]).filter(c=>c!==n);});
      Object.values(st.pods).forEach(p=>{p.containers=(p.containers||[]).filter(c=>c!==n);});
      delete st.containers[n];OK(n);
    });
    return {state:st,out};
  }

  /* ── container prune ── */
  if(sub==="container"&&TU[2]==="prune"){
    const stopped=Object.keys(st.containers).filter(n=>{
      const s=st.containers[n].status;
      return !s.startsWith("Up")&&s!=="Paused";
    });
    stopped.forEach(n=>{
      Object.values(st.networks).forEach(net=>{net.containers=(net.containers||[]).filter(c=>c!==n);});
      delete st.containers[n];
    });
    OK(`Removed ${stopped.length} container(s).`);
    return {state:st,out};
  }

  /* ── rename ── */
  if(sub==="rename"){
    const[old2,nn]=TU.slice(2);
    if(!old2||!nn){ERR("Usage: podman rename <old> <new>");return {state:st,out};}
    if(!st.containers[old2]){ERR(`Error: no container "${old2}"`);return {state:st,out};}
    if(st.containers[nn]){ERR(`Error: name "${nn}" is already in use`);return {state:st,out};}
    st.containers[nn]=st.containers[old2];delete st.containers[old2];
    Object.values(st.networks).forEach(net=>{net.containers=(net.containers||[]).map(c=>c===old2?nn:c);});
    Object.values(st.pods).forEach(p=>{p.containers=(p.containers||[]).map(c=>c===old2?nn:c);});
    OK(`${old2} → ${nn}`);
    return {state:st,out};
  }

  /* ── commit ── */
  if(sub==="commit"){
    const[cn,newImg]=TU.slice(2);
    if(!cn||!newImg){ERR("Usage: podman commit <container> <new-image>");return {state:st,out};}
    if(!st.containers[cn]){ERR(`Error: no container "${cn}"`);return {state:st,out};}
    const baseSize=parseInt(st.images[st.containers[cn].image]?.size)||50;
    const nk=newImg.includes(":")?newImg:newImg+":latest";
    st.images[nk]={id:rndHex(12),size:(baseSize+5)+" MB",created:"just now",layers:(st.images[st.containers[cn].image]?.layers||4)+1,ports:[]};
    OK(`sha256:${st.images[nk].id}`);
    INF(`# Image ${nk} created from container ${cn}`);
    return {state:st,out};
  }

  /* ── diff ── */
  if(sub==="diff"){
    const n=TU[2];if(!n){ERR("Usage: podman diff <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    DIM("C /etc");DIM("A /etc/myapp.conf");DIM("C /var");DIM("A /var/log/myapp.log");DIM("D /tmp/old-file");
    INF("# C=Changed, A=Added, D=Deleted");
    return {state:st,out};
  }

  /* ── wait ── */
  if(sub==="wait"){
    const n=TU[2];if(!n){ERR("Usage: podman wait <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    DIM(`Waiting for container "${n}" to exit...`);
    st.containers[n].status="Exited (0)";DIM("0");
    return {state:st,out};
  }

  /* ── events ── */
  if(sub==="events"){
    DIM("2024-03-15 08:00:01.123 container start "+rndHex(12)+" (image=nginx:alpine, name=web)");
    DIM("2024-03-15 08:00:02.456 container exec "+rndHex(12)+" (image=nginx:alpine, name=web)");
    DIM("2024-03-15 08:00:05.789 container died "+rndHex(12)+" (image=alpine:latest, name=debug, exitCode=0)");
    DIM("(Ctrl+C to stop streaming)");
    return {state:st,out};
  }

  /* ── logs ── */
  if(sub==="logs"){
    const follow=TU.includes("-f")||TU.includes("--follow");
    const tailIdx=TU.indexOf("--tail");const tail=tailIdx>=0?(parseInt(TU[tailIdx+1])||20):20;
    const sinceIdx=TU.indexOf("--since");const since=sinceIdx>=0?TU[sinceIdx+1]:null;
    const untilIdx=TU.indexOf("--until");
    const flagVals=new Set([TU[tailIdx+1],TU[sinceIdx+1],TU[untilIdx+1]].filter(Boolean));
    const n=TU.slice(2).find(t=>!t.startsWith("-")&&!flagVals.has(t));
    if(!n){ERR("Error: 'podman logs' requires a container name");DIM("Usage: podman logs [-f] [--tail N] [--since T] <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container with name or id "${n}" found`);DIM(`Available: ${Object.keys(st.containers).join(", ")||"(none)"}`);return {state:st,out};}
    if(since) DIM(`# Logs since ${since}`);
    const img=(st.containers[n].image||"").split(":")[0].split("/").pop();
    const logMap={
      nginx:["2024/03/15 08:00:01 [notice] nginx/1.25.3","2024/03/15 08:00:01 [notice] start worker processes","10.88.0.1 - - [15/Mar/2024:08:00:05] \"GET / HTTP/1.1\" 200 615 \"-\"","10.88.0.1 - - [15/Mar/2024:08:01:00] \"GET /health HTTP/1.1\" 200 2 \"-\"","10.88.0.1 - - [15/Mar/2024:08:01:30] \"POST /api/data HTTP/1.1\" 201 88 \"-\""],
      postgres:["2024-03-15 08:00:00.001 UTC [1] LOG: starting PostgreSQL 15.3 on x86_64","2024-03-15 08:00:00.012 UTC [1] LOG: listening on IPv4 address \"0.0.0.0\", port 5432","2024-03-15 08:00:00.016 UTC [1] LOG: database system was shut down","2024-03-15 08:00:00.022 UTC [1] LOG: database system is ready to accept connections"],
      redis:["1:C 15 Mar 2024 08:00:00.001 # Redis version=7.2.4, bits=64","1:M 15 Mar 2024 08:00:00.010 * Server initialized","1:M 15 Mar 2024 08:00:00.012 * Ready to accept connections tcp","1:M 15 Mar 2024 08:00:05.200 - Accepted 10.88.0.5:42312"],
      node:["[server] Starting on port 3000","[db] Connected to postgres:5432","[server] GET / 200 12ms","[server] POST /api/users 201 45ms","[server] GET /api/health 200 2ms"],
      python:["[2024-03-15 08:00:00] INFO: Starting application","[2024-03-15 08:00:00] INFO: Database connected","[2024-03-15 08:00:01] INFO: Server listening on 0.0.0.0:5000"],
    };
    const ls=logMap[img]||["Container started","Process running","Waiting for connections...","Health check OK"];
    ls.slice(0,tail).forEach(DIM);
    if(follow) DIM("(following — press Ctrl+C to stop)");
    return {state:st,out};
  }

  /* ── exec ── */
  if(sub==="exec"){
    const {name:n, cmd:execCmd}=parseExecName(TU);
    if(!n){ERR("Error: 'podman exec' requires a container name");DIM("Usage: podman exec [-it] <name> <command>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container with name or id "${n}" found`);DIM(`Available: ${Object.keys(st.containers).join(", ")||"(none)"}`);return {state:st,out};}
    if(!st.containers[n].status.startsWith("Up")){
      ERR(`Error: container "${n}" is not running`);
      DIM(`Current status: ${st.containers[n].status}`);
      DIM(`Start it first: podman start ${n}`);
      return {state:st,out};
    }
    const ec=execCmd.toLowerCase();
    if(!ec||ec==="sh"||ec==="bash"||ec==="/bin/sh"||ec==="/bin/bash"||ec==="/bin/ash"){
      OK(`[${n}] / #`);DIM("(simulated shell — type exit to leave)");
    } else if(ec==="env"||ec==="printenv"){
      DIM("PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
      DIM(`HOSTNAME=${n}`);DIM("HOME=/root");
      (st.containers[n].env||[]).forEach(DIM);
    } else if(ec.startsWith("ping")){
      const target=execCmd.split(/\s+/).find((_,i)=>i>0);
      const tc=target?st.containers[target]:null;
      const selfNet=st.containers[n].network;
      const targetNet=tc?.network;
      if(!target){ERR("ping: usage error: Destination address required");return {state:st,out};}
      if(!tc){ERR(`ping: ${target}: Temporary failure in name resolution`);INF("Tip: container must exist and be on the same network");}
      else if(selfNet!==targetNet){ERR(`ping: ${target}: Temporary failure in name resolution`);WRN(`"${n}" is on network "${selfNet}", "${target}" is on "${targetNet}"`);INF(`Fix: podman network connect ${selfNet} ${target}`);}
      else{DIM(`PING ${target} (${tc.ip}): 56 data bytes`);OK(`64 bytes from ${tc.ip}: icmp_seq=0 ttl=64 time=0.089 ms`);OK(`64 bytes from ${tc.ip}: icmp_seq=1 ttl=64 time=0.091 ms`);DIM(`--- ${target} ping statistics ---`);DIM(`2 packets transmitted, 2 received, 0% packet loss, time 1000ms`);}
    } else if(ec.startsWith("curl")||ec.startsWith("wget")){
      const url=execCmd.split(/\s+/).find(t=>t.startsWith("http"))||"http://localhost";
      if(url.includes("localhost")||url.includes("127.0.0.1")){
        DIM("<!DOCTYPE html><html><head><title>Welcome to nginx!</title></head>");
        DIM("<body><h1>Welcome to nginx!</h1><p>Server is running.</p></body></html>");
      } else {
        const target=url.replace(/https?:\/\//,"").split("/")[0].split(":")[0];
        const tc=st.containers[target];
        if(tc&&tc.network===st.containers[n].network){DIM("<!DOCTYPE html><html><body><h1>Response from "+target+"</h1></body></html>");}
        else{ERR(`curl: (6) Could not resolve host: ${target}`);INF("Tip: containers must be on the same network to communicate by name");}
      }
    } else if(ec.startsWith("ps")&&!ec.includes("podman")){
      HDR("PID   USER     TIME   COMMAND");
      DIM("    1 root     0:00   /init");DIM("    8 root     0:00   nginx: master process");DIM("   12 nginx    0:00   nginx: worker process");
    } else if(ec.includes("cat /etc/os-release")){
      DIM('NAME="Alpine Linux"');DIM('VERSION_ID=3.19.1');DIM('PRETTY_NAME="Alpine Linux v3.19"');DIM('HOME_URL="https://alpinelinux.org/"');
    } else if(ec.includes("df -h")||ec.includes("df -sh")){
      HDR("Filesystem      Size  Used Avail Use% Mounted on");
      DIM("overlay          50G  2.1G   48G   5% /");DIM("tmpfs            64M     0   64M   0% /dev");DIM("shm              64M     0   64M   0% /dev/shm");
    } else if(ec.includes("ls")){
      DIM("app  bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var");
    } else if(ec.includes("id")){
      DIM("uid=0(root) gid=0(root) groups=0(root)");
    } else if(ec.includes("hostname")){
      DIM(n);
    } else if(ec.includes("cat /proc/1/cgroup")){
      DIM("0::/user.slice/user-1001.slice/user@1001.service/cgroup.slice/...");
    } else {
      DIM(`(exec: ${execCmd})`);
    }
    return {state:st,out};
  }

  /* ── inspect ── */
  if(sub==="inspect"){
    const n=TU[2];
    if(!n){ERR("Usage: podman inspect <name|id>");return {state:st,out};}
    const c=st.containers[n];
    const img=st.images[n]||st.images[n+":latest"];
    if(!c&&!img){ERR(`Error: no such object: ${n}`);return {state:st,out};}
    DIM("[");DIM("  {");
    if(c){
      DIM(`    "Id": "${c.id}",`);
      DIM(`    "Name": "/${n}",`);
      DIM(`    "State": {`);
      DIM(`      "Status": "${c.status.split(" ")[0].toLowerCase()}",`);
      DIM(`      "Running": ${c.status.startsWith("Up")},`);
      DIM(`      "Paused": ${c.status==="Paused"},`);
      DIM(`      "ExitCode": ${c.status.includes("Exited")?parseInt(c.status.match(/\d+/)?.[0]||"0"):0}`);
      DIM(`    },`);
      DIM(`    "Image": "${c.image}",`);
      DIM(`    "NetworkSettings": {`);
      DIM(`      "IPAddress": "${c.ip}",`);
      DIM(`      "Networks": { "${c.network}": { "IPAddress": "${c.ip}" } }`);
      DIM(`    },`);
      DIM(`    "HostConfig": { "PortBindings": ${JSON.stringify(c.ports||{})} },`);
      DIM(`    "Config": {`);
      DIM(`      "Image": "${c.image}",`);
      DIM(`      "Env": ${JSON.stringify(c.env||[])},`);
      DIM(`      "Volumes": ${JSON.stringify((c.volumes||[]).reduce((a,v)=>{const k=v.split(":")[1]||v;a[k]={};return a},{}))} `);
      DIM(`    }`);
    } else {
      DIM(`    "Id": "sha256:${img.id}",`);
      DIM(`    "RepoTags": ["${n}"],`);
      DIM(`    "Size": "${img.size}",`);
      DIM(`    "Created": "${img.created}",`);
      DIM(`    "RootFS": { "Type": "layers", "Layers": ${img.layers||4} },`);
      DIM(`    "ExposedPorts": ${JSON.stringify((img.ports||[]).reduce((a,p)=>{a[p]={};return a},{}))} `);
    }
    DIM("  }");DIM("]");
    return {state:st,out};
  }

  /* ── stats ── */
  if(sub==="stats"){
    const noStream=TU.includes("--no-stream");
    const nameArg=TU.find((t,i)=>i>1&&!t.startsWith("-")&&t!=="stats");
    const ctrs=nameArg
      ? (st.containers[nameArg]?[[nameArg,st.containers[nameArg]]]:null)
      : Object.entries(st.containers).filter(([,c])=>c.status.startsWith("Up"));
    if(nameArg&&!ctrs){ERR(`Error: no container "${nameArg}"`);return {state:st,out};}
    if(!ctrs||!ctrs.length){DIM("(no running containers)");return {state:st,out};}
    HDR("ID            NAME          CPU %   MEM USAGE / LIMIT     MEM %   NET I/O         BLOCK I/O   PIDS");
    ctrs.forEach(([nm,c])=>{
      const cpu=(Math.random()*5).toFixed(2);const mem=Math.floor(Math.random()*300+20);
      const pids=Math.floor(Math.random()*10+2);
      L(`${c.id.slice(0,12)}  ${nm.padEnd(14)}${cpu.padEnd(8)}${mem}MB / 16.7GB      ${(mem/16700*100).toFixed(2)}%   ${Math.floor(Math.random()*500)}kB/${Math.floor(Math.random()*100)}kB   0B/0B       ${pids}`);
    });
    if(!noStream) DIM("(stats refreshing — add --no-stream for snapshot)");
    return {state:st,out};
  }

  /* ── top ── */
  if(sub==="top"){
    const n=TU[2];
    if(!n){ERR("Usage: podman top <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    if(!st.containers[n].status.startsWith("Up")){ERR(`Error: container "${n}" is not running`);return {state:st,out};}
    HDR("UID       PID     PPID    C  STIME  TTY  TIME       COMMAND");
    DIM("root      1       0       0  08:00  ?    00:00:00   /init");
    DIM("root      8       1       0  08:00  ?    00:00:00   nginx: master process");
    DIM("nginx     12      8       0  08:00  ?    00:00:02   nginx: worker process");
    DIM("nginx     13      8       0  08:00  ?    00:00:01   nginx: worker process");
    return {state:st,out};
  }

  /* ── port ── */
  if(sub==="port"){
    const n=TU[2];
    if(!n){ERR("Usage: podman port <name>");return {state:st,out};}
    if(!st.containers[n]){ERR(`Error: no container "${n}"`);return {state:st,out};}
    const p=st.containers[n].ports||{};
    if(!Object.keys(p).length){DIM("(no port bindings)");}
    else Object.entries(p).forEach(([k,v])=>DIM(`${k} -> 0.0.0.0:${v}`));
    return {state:st,out};
  }

  /* ── cp ── */
  if(sub==="cp"){
    const[src2,dst2]=TU.slice(2);
    if(!src2||!dst2){ERR("Usage: podman cp <src> <name>:<path>  or  podman cp <name>:<path> <dst>");return {state:st,out};}
    OK(`'${src2}' copied to '${dst2}'`);
    return {state:st,out};
  }

  /* ── network ── */
  if(sub==="network"){
    const op=TU[2];
    if(!op){ERR("Usage: podman network <create|ls|inspect|connect|disconnect|rm|prune>");return {state:st,out};}

    if(op==="create"){
      const sIdx=TU.indexOf("--subnet");const subnet=sIdx>=0?TU[sIdx+1]:`192.168.${Math.floor(Math.random()*200+10)}.0/24`;
      const gIdx=TU.indexOf("--gateway");const gw=gIdx>=0?TU[gIdx+1]:subnet.replace(/\d+\/\d+$/,"1");
      const dIdx=TU.indexOf("--driver");// ignore driver, always bridge
      // network name is the last non-flag token after "create"
      const skipVals=new Set([TU[sIdx+1],TU[gIdx+1],TU[dIdx+1]].filter(Boolean));
      const nn=TU.slice(3).find(t=>!t.startsWith("-")&&!skipVals.has(t))||"net_"+rndHex(6);
      if(st.networks[nn]){ERR(`Error: network with name "${nn}" already exists`);return {state:st,out};}
      st.networks[nn]={id:rndHex(12),driver:"bridge",subnet,gateway:gw,internal:TU.includes("--internal"),containers:[]};
      OK(nn);INF(`# Network created: ${nn} (${subnet})`);
      return {state:st,out};
    }
    if(op==="ls"){
      HDR("NETWORK ID    NAME        DRIVER   SUBNET              INTERNAL");
      Object.entries(st.networks).forEach(([n,net])=>{
        L(`${net.id.slice(0,12)}  ${n.padEnd(12)}bridge   ${(net.subnet||"N/A").padEnd(20)}${net.internal?"true":"false"}`);
      });
      return {state:st,out};
    }
    if(op==="inspect"){
      const nn=TU[3];if(!nn){ERR("Usage: podman network inspect <name>");return {state:st,out};}
      const net=st.networks[nn];if(!net){ERR(`Error: network "${nn}" not found`);DIM(`Run 'podman network ls' to see available networks`);return {state:st,out};}
      const ctrsMap=(net.containers||[]).reduce((a,c)=>{if(st.containers[c])a[c]={name:c,interface:"eth0",static_ips:null,aliases:[c],ipv4_address:st.containers[c].ip};return a},{});
      DIM(JSON.stringify([{name:nn,id:net.id,driver:"bridge",network_interface:"cni-podman0",created:"2024-03-15T08:00:00Z",subnets:[{subnet:net.subnet,gateway:net.gateway}],internal:net.internal,containers:ctrsMap}],null,2));
      return {state:st,out};
    }
    if(op==="connect"){
      const nn=TU[3],cn=TU[4];
      if(!nn||!cn){ERR("Usage: podman network connect <network> <container>");return {state:st,out};}
      if(!st.networks[nn]){ERR(`Error: network "${nn}" not found`);return {state:st,out};}
      if(!st.containers[cn]){ERR(`Error: container "${cn}" not found`);return {state:st,out};}
      if(!(st.networks[nn].containers||[]).includes(cn)){
        st.networks[nn].containers=[...(st.networks[nn].containers||[]),cn];
        st.containers[cn].network=nn;
      }
      OK(`Connected container "${cn}" to network "${nn}"`);
      return {state:st,out};
    }
    if(op==="disconnect"){
      const nn=TU[3],cn=TU[4];
      if(!nn||!cn){ERR("Usage: podman network disconnect <network> <container>");return {state:st,out};}
      if(!st.networks[nn]){ERR(`Error: network "${nn}" not found`);return {state:st,out};}
      st.networks[nn].containers=(st.networks[nn].containers||[]).filter(c=>c!==cn);
      OK(`Disconnected container "${cn}" from network "${nn}"`);
      return {state:st,out};
    }
    if(op==="rm"||op==="remove"){
      const tgts=TU.slice(3);if(!tgts.length){ERR("Usage: podman network rm <name>");return {state:st,out};}
      tgts.forEach(nn=>{
        if(!st.networks[nn]){ERR(`Error: "${nn}" not found`);return;}
        if(nn==="podman"){ERR(`Error: default network "podman" cannot be removed`);return;}
        const active=(st.networks[nn].containers||[]).filter(c=>st.containers[c]);
        if(active.length>0){ERR(`Error: network "${nn}" is in use by containers: ${active.join(", ")}`);DIM("Disconnect them first: podman network disconnect "+nn+" <container>");return;}
        delete st.networks[nn];OK(nn);
      });
      return {state:st,out};
    }
    if(op==="prune"){
      const unused=Object.keys(st.networks).filter(n=>n!=="podman"&&!(st.networks[n].containers||[]).filter(c=>st.containers[c]).length);
      unused.forEach(n=>delete st.networks[n]);
      OK(`Removed ${unused.length} unused network(s).`);
      return {state:st,out};
    }
    ERR(`Error: unknown network subcommand: "${op}"`);
    DIM("Available: create ls inspect connect disconnect rm prune");
    return {state:st,out};
  }

  /* ── volume ── */
  if(sub==="volume"){
    const op=TU[2];
    if(!op){ERR("Usage: podman volume <create|ls|inspect|rm|prune|export|import>");return {state:st,out};}

    if(op==="create"){
      const vn=TU.slice(3).find(t=>!t.startsWith("-"))||TU[3];
      if(!vn){ERR("Error: 'podman volume create' requires a volume name");return {state:st,out};}
      if(st.volumes[vn]){ERR(`Error: volume "${vn}" already exists`);return {state:st,out};}
      st.volumes[vn]={driver:"local",mountpoint:`/home/max/.local/share/containers/storage/volumes/${vn}/_data`,created:"just now",size:"0 B"};
      OK(vn);
      return {state:st,out};
    }
    if(op==="ls"){
      HDR("DRIVER      VOLUME NAME         CREATED");
      if(!Object.keys(st.volumes).length){DIM("(no volumes — try: podman volume create mydata)");return {state:st,out};}
      Object.entries(st.volumes).forEach(([n,v])=>{
        L(`local       ${n.padEnd(20)}${v.created}`);
      });
      return {state:st,out};
    }
    if(op==="inspect"){
      const vn=TU[3];if(!vn){ERR("Usage: podman volume inspect <name>");return {state:st,out};}
      const v=st.volumes[vn];if(!v){ERR(`Error: no volume with name "${vn}"`);DIM(`Run 'podman volume ls' to see available volumes`);return {state:st,out};}
      DIM(JSON.stringify([{Name:vn,Driver:v.driver,Mountpoint:v.mountpoint,CreatedAt:v.created,Status:{},Labels:{},Scope:"local",Options:{},UsageData:{Size:0,RefCount:0}}],null,2));
      return {state:st,out};
    }
    if(op==="rm"||op==="remove"){
      const force=TU.includes("-f");
      const tgts=TU.slice(3).filter(t=>t!=="-f");
      if(!tgts.length){ERR("Usage: podman volume rm <name>");return {state:st,out};}
      tgts.forEach(vn=>{
        if(!st.volumes[vn]){ERR(`Error: no volume with name "${vn}"`);return;}
        const inUse=Object.values(st.containers).some(c=>(c.volumes||[]).some(v=>{const p=v.split(":")[0];return p===vn;}));
        if(inUse&&!force){ERR(`Error: volume "${vn}" is in use by a container. Use -f to force.`);return;}
        delete st.volumes[vn];OK(vn);
      });
      return {state:st,out};
    }
    if(op==="prune"){
      const count=Object.keys(st.volumes).length;
      st.volumes={};OK(`Removed ${count} volume(s).`);
      return {state:st,out};
    }
    if(op==="export"){
      const oIdx=TU.indexOf("-o");const f=oIdx>=0?TU[oIdx+1]:"volume.tar";
      const vn=TU.find((t,i)=>i>2&&!t.startsWith("-")&&t!==f);
      if(!vn){ERR("Usage: podman volume export -o <file> <volume>");return {state:st,out};}
      if(!st.volumes[vn]){ERR(`Error: no volume "${vn}"`);return {state:st,out};}
      DIM(`Exporting volume "${vn}" to ${f}...`);
      OK(`Volume exported successfully (${Math.floor(Math.random()*500+100)}KB)`);
      return {state:st,out};
    }
    if(op==="import"){
      const vn=TU[3];const f=TU[4];
      if(!vn||!f){ERR("Usage: podman volume import <volume> <file>");return {state:st,out};}
      if(!st.volumes[vn]){ERR(`Error: no volume "${vn}" — create it first: podman volume create ${vn}`);return {state:st,out};}
      DIM(`Importing ${f} into volume "${vn}"...`);
      st.volumes[vn].size=Math.floor(Math.random()*500+100)+" KB";
      OK("Import complete.");
      return {state:st,out};
    }
    ERR(`Error: unknown volume subcommand: "${op}"`);
    DIM("Available: create ls inspect rm prune export import");
    return {state:st,out};
  }

  /* ── pod ── */
  if(sub==="pod"){
    const op=TU[2];
    if(!op){ERR("Usage: podman pod <create|ls|inspect|stop|start|restart|rm|stats>");return {state:st,out};}

    if(op==="create"){
      const nIdx=TU.indexOf("--name");const pn=nIdx>=0?TU[nIdx+1]:"pod_"+rndHex(6);
      const pIdx=TU.indexOf("-p");const ports=pIdx>=0?TU[pIdx+1]:"";
      if(st.pods[pn]){ERR(`Error: pod "${pn}" already exists`);return {state:st,out};}
      const infraId=rndHex(12);
      st.pods[pn]={id:rndHex(12),status:"Created",containers:[],ports,infra:infraId};
      OK(st.pods[pn].id);
      DIM(`# Infra container (pause) created: ${infraId.slice(0,12)}`);
      INF("# Infra container owns the network namespace — all pod containers share it");
      return {state:st,out};
    }
    if(op==="ls"){
      HDR("POD ID        NAME          STATUS     CREATED    INFRA ID      # OF CTRS");
      if(!Object.keys(st.pods).length){DIM("(no pods — try: podman pod create --name mypod)");return {state:st,out};}
      Object.entries(st.pods).forEach(([n,p])=>{
        const k=p.status==="Running"?"ok":p.status==="Stopped"?"dim":"out";
        L(`${p.id.slice(0,12)}  ${n.padEnd(14)}${p.status.padEnd(11)}just now   ${p.infra.slice(0,12)}  ${(p.containers||[]).length+1}`,k);
      });
      return {state:st,out};
    }
    if(op==="inspect"){
      const pn=TU[3];if(!pn){ERR("Usage: podman pod inspect <name>");return {state:st,out};}
      const p=st.pods[pn];if(!p){ERR(`Error: no pod "${pn}"`);return {state:st,out};}
      const ctrsDetail=(p.containers||[]).map(c=>({Id:st.containers[c]?.id||rndHex(12),Name:c,Status:(st.containers[c]||{}).status||"unknown"}));
      DIM(JSON.stringify({Name:pn,Id:p.id,Created:"2024-03-15T08:00:00Z",State:p.status,Hostname:pn,InfraContainerId:p.infra,SharedNamespaces:["net","uts","ipc"],NumContainers:(p.containers||[]).length+1,Containers:ctrsDetail},null,2));
      return {state:st,out};
    }
    if(op==="stop"||op==="start"||op==="restart"){
      const pn=TU[3];if(!pn){ERR(`Usage: podman pod ${op} <name>`);return {state:st,out};}
      if(!st.pods[pn]){ERR(`Error: no pod "${pn}"`);return {state:st,out};}
      const ns=op==="stop"?"Stopped":"Running";
      const cStatus=op==="stop"?"Exited (0)":"Up";
      st.pods[pn].status=ns;
      (st.pods[pn].containers||[]).forEach(c=>{if(st.containers[c])st.containers[c].status=cStatus;});
      OK(pn);
      return {state:st,out};
    }
    if(op==="rm"||op==="remove"){
      const force=TU.includes("-f");
      const pn=TU.find((t,i)=>i>2&&!t.startsWith("-"))||TU[3];
      if(!pn){ERR(`Usage: podman pod rm [-f] <name>`);return {state:st,out};}
      if(!st.pods[pn]){ERR(`Error: no pod "${pn}"`);return {state:st,out};}
      if(st.pods[pn].status==="Running"&&!force){ERR(`Error: pod "${pn}" is running. Use -f to force.`);return {state:st,out};}
      (st.pods[pn].containers||[]).forEach(c=>{
        Object.values(st.networks).forEach(net=>{net.containers=(net.containers||[]).filter(x=>x!==c);});
        delete st.containers[c];
      });
      delete st.pods[pn];OK(pn);
      return {state:st,out};
    }
    if(op==="stats"){
      const pn=TU[3];if(!pn){ERR("Usage: podman pod stats <name>");return {state:st,out};}
      const p=st.pods[pn];if(!p){ERR(`Error: no pod "${pn}"`);return {state:st,out};}
      HDR("POD           CPU %   MEM USAGE    MEM %    BLOCK I/O   PIDS");
      const mem=Math.floor(Math.random()*500+100);
      L(`${pn.padEnd(14)}${(Math.random()*5).toFixed(2)}%    ${mem}MB         ${(mem/16700*100).toFixed(2)}%     0B/0B       ${Math.floor(Math.random()*20+5)}`);
      return {state:st,out};
    }
    ERR(`Error: unknown pod subcommand: "${op}"`);
    DIM("Available: create ls inspect stop start restart rm stats");
    return {state:st,out};
  }

  /* ── generate kube ── */
  if(sub==="generate"&&TU[2]==="kube"){
    const pn=TU[3];
    if(!pn){ERR("Usage: podman generate kube <pod-name>");return {state:st,out};}
    const p=st.pods[pn];
    if(!p){ERR(`Error: no pod "${pn}"`);DIM(`Available pods: ${Object.keys(st.pods).join(", ")||"(none)"}`);DIM("Create a pod first: podman pod create --name mypod");return {state:st,out};}
    DIM(`# Generated by: podman generate kube ${pn}`);
    DIM(`# Deployment: save to file with > ${pn}.yaml`);
    L("---","hdr");
    DIM("apiVersion: v1");DIM("kind: Pod");DIM("metadata:");
    DIM(`  creationTimestamp: "2024-03-15T08:00:00Z"`);
    DIM(`  labels:`);DIM(`    app: ${pn}`);DIM(`  name: ${pn}`);
    DIM("spec:");DIM("  containers:");
    (p.containers||[]).forEach(c=>{
      const ctr=st.containers[c];
      DIM(`  - name: ${c}`);DIM(`    image: ${ctr?.image||"unknown"}`);
      const portEntries=Object.entries(ctr?.ports||{});
      if(portEntries.length){DIM("    ports:");portEntries.forEach(([k])=>DIM(`    - containerPort: ${k.split("/")[0]}  protocol: TCP`));}
      if(ctr?.env?.length){DIM("    env:");ctr.env.forEach(e=>{const[ek,ev]=e.split("=");DIM(`    - name: ${ek}`);DIM(`      value: "${ev||""}"`);})}
      if(ctr?.volumes?.length){DIM("    volumeMounts:");ctr.volumes.forEach(v=>{const p2=v.split(":")[1]||"/data";DIM(`    - mountPath: ${p2}`);DIM(`      name: ${v.split(":")[0].replace(/[^a-z0-9]/gi,"-")}-pvc`);});}
    });
    if(p.ports){DIM(`  # Host port mapping was: ${p.ports} (not K8s native, use Service instead)`)}
    DIM("  restartPolicy: Always");
    DIM("  hostNetwork: false");
    L("","out");
    OK(`# Apply to Kubernetes: kubectl apply -f ${pn}.yaml`);
    INF(`# Or run locally: podman play kube ${pn}.yaml`);
    return {state:st,out};
  }

  /* ── play kube ── */
  if(sub==="play"&&TU[2]==="kube"){
    if(TU.includes("--down")){OK("Pod and containers removed (played down).");return {state:st,out};}
    const f=TU[3]||"pod.yaml";
    DIM(`Reading YAML from ${f}...`);
    OK("Pod and containers created successfully.");
    DIM("Use 'podman pod ls' and 'podman ps' to verify.");
    return {state:st,out};
  }

  /* ── unshare ── */
  if(sub==="unshare"){
    const uc=TU.slice(2).join(" ");
    if(!uc){
      DIM("uid=0(root) gid=0(root) groups=0(root),65534(nobody)");
      INF("# You are now in the rootless user namespace");
      INF("# UID 0 here → UID 1001 (max) on the host");
      INF("# Use 'exit' to leave the namespace");
    } else if(uc.includes("id")){
      DIM("uid=0(root) gid=0(root) groups=0(root),65534(nobody)");
      INF("# UID 0 inside user namespace = UID 1001 on host");
    } else if(uc.includes("chown")){
      OK("Ownership changed inside user namespace.");
      INF("# Files now appear correctly owned by your UID on the host");
    } else if(uc.includes("ls")){
      DIM("total 0");
      DIM("drwxr-xr-x  2 root root  40 Mar 15 08:00 .");
      DIM("drwxrwxrwt 12 root root 280 Mar 15 08:00 ..");
    } else {
      DIM(`(unshare: ${uc})`);
    }
    return {state:st,out};
  }

  /* ── catch-all ── */
  ERR(`Error: unknown command: "podman ${TU.slice(1).join(" ")}"`);
  DIM("Run 'help' for a complete list of commands.");
  DIM(`Did you mean: podman ${sub} --help ?`);
  return {state:st,out};
}

/* ─────────────────────────────────────────────────────────────
   LAB DATA  — 8 labs, beginner → advanced
───────────────────────────────────────────────────────────── */
const LABS = [
  /* ════ LAB 1 ════════════════════════════════════════════════ */
  {
    id:"L1",icon:"🚀",title:"First Container",difficulty:"Beginner",xp:100,color:"var(--g)",
    desc:"Pull, run, inspect, and stop your first rootless container.",
    intro:"Podman runs containers as your regular user — no daemon, no sudo. Each container is a child process of your shell. Let's start with the basics.",
    sections:[
      {
        title:"1 · Verify Podman",
        content:"Before running containers, verify Podman is installed correctly. 'podman version' shows versions and confirms rootless mode. 'podman info' reveals storage driver, registry config, and security settings.",
        examples:[
          "podman version",
          "podman info",
          "podman system info",
          "# Look for: Rootless: true",
          "# Storage: overlay driver under ~/.local/share/containers",
        ],
        objectives:[
          {id:"v1",text:"Run podman version",hint:"podman version",check:(h)=>h.some(c=>c==="podman version")},
          {id:"v2",text:"Run podman info to confirm rootless mode",hint:"podman info",check:(h)=>h.some(c=>c==="podman info"||c==="podman system info")},
        ]
      },
      {
        title:"2 · Pull an Image",
        content:"Images are pulled from registries (Docker Hub by default). Once cached locally, subsequent pulls skip the download. The OCI format is the same as Docker — all Docker images work with Podman.",
        examples:[
          "podman pull nginx:alpine",
          "podman pull alpine:latest",
          "podman pull redis:7-alpine",
          "podman images",
          "podman history nginx:alpine",
          "# :alpine tag = smaller image built on Alpine Linux",
          "# Always prefer :alpine or :slim variants in production",
        ],
        objectives:[
          {id:"p1",text:"Pull nginx:alpine from the registry",hint:"podman pull nginx:alpine",check:(h)=>h.some(c=>c.includes("pull")&&c.includes("nginx"))},
          {id:"p2",text:"List all local images with podman images",hint:"podman images",check:(h)=>h.some(c=>c==="podman images")},
        ]
      },
      {
        title:"3 · Run Your First Container",
        content:"Run nginx detached (-d) with a name and port mapping. Port 8080 on your host routes to port 80 inside the container. Rootless Podman cannot bind ports below 1024 by default — use 8080, not 80.",
        examples:[
          "podman run -d --name web -p 8080:80 nginx:alpine",
          "podman ps",
          "podman ps -a",
          "podman port web",
          "# -d  = detached/background",
          "# --name web  = assign a memorable name",
          "# -p 8080:80  = hostPort:containerPort",
        ],
        objectives:[
          {id:"r1",text:"Run nginx named 'web' on port 8080:80",hint:"podman run -d --name web -p 8080:80 nginx:alpine",check:(h,s)=>!!s.containers["web"]?.status?.startsWith("Up")},
          {id:"r2",text:"List running containers with podman ps",hint:"podman ps",check:(h)=>h.some(c=>c==="podman ps")},
        ]
      },
      {
        title:"4 · Inspect & Logs",
        content:"Three essential tools: logs (stdout/stderr stream), inspect (full JSON config), stats (live CPU/memory). These are your primary debugging tools.",
        examples:[
          "podman logs web",
          "podman logs --tail 5 web",
          "podman logs -f web",
          "podman inspect web",
          "podman stats --no-stream web",
          "podman top web",
          "podman port web",
          "# --no-stream = one-shot snapshot instead of live view",
        ],
        objectives:[
          {id:"l1",text:"View logs for the 'web' container",hint:"podman logs web",check:(h)=>h.some(c=>c.includes("logs")&&c.includes("web"))},
          {id:"l2",text:"Inspect web container (full JSON config)",hint:"podman inspect web",check:(h)=>h.some(c=>c.includes("inspect web"))},
        ]
      },
    ],
  },

  /* ════ LAB 2 ════════════════════════════════════════════════ */
  {
    id:"L2",icon:"♻️",title:"Container Lifecycle",difficulty:"Beginner",xp:150,color:"var(--c)",
    desc:"Stop, start, pause, restart, commit — master every state transition.",
    intro:"Containers transition through states: Created → Running → Paused → Stopped → Removed. Each state uses a specific signal or command. Understanding this is essential for day-to-day operations.",
    sections:[
      {
        title:"1 · Create & Verify",
        content:"Start a long-running container to practice lifecycle commands. 'sleep 3600' keeps it alive for 1 hour. We use alpine — the smallest base image at just 7MB.",
        examples:[
          "podman run -d --name myapp alpine sleep 3600",
          "podman ps",
          "podman inspect myapp",
          "# alpine is the smallest viable base image (7.3MB)",
          "# sleep 3600 keeps the container running for 1 hour",
        ],
        objectives:[
          {id:"c1",text:"Run 'myapp' container in background",hint:"podman run -d --name myapp alpine sleep 3600",check:(h,s)=>!!s.containers["myapp"]},
          {id:"c2",text:"Verify it's running with podman ps",hint:"podman ps",check:(h)=>h.some(c=>c==="podman ps")},
        ]
      },
      {
        title:"2 · Stop & Start",
        content:"Stop sends SIGTERM (graceful shutdown signal), then waits 10 seconds before sending SIGKILL. Start brings a stopped container back — same image, same config, new process. Restart combines both.",
        examples:[
          "podman stop myapp",
          "podman ps -a",
          "podman start myapp",
          "podman restart myapp",
          "podman stop -t 30 myapp",
          "# -t 30 = wait 30 seconds before SIGKILL (default is 10)",
          "# podman ps -a shows ALL containers including stopped",
        ],
        objectives:[
          {id:"s1",text:"Stop the myapp container",hint:"podman stop myapp",check:(h,s)=>s.containers["myapp"]?.status?.includes("Exited")},
          {id:"s2",text:"Show stopped container with podman ps -a",hint:"podman ps -a",check:(h)=>h.some(c=>c==="podman ps -a")},
          {id:"s3",text:"Start myapp again",hint:"podman start myapp",check:(h,s)=>s.containers["myapp"]?.status?.startsWith("Up")},
        ]
      },
      {
        title:"3 · Pause & Unpause",
        content:"Pause sends SIGSTOP to every process in the container. They freeze in memory — CPU drops to 0, but RAM is preserved. Unpause resumes instantly with SIGCONT. Great for snapshots or temporarily freeing CPU.",
        examples:[
          "podman pause myapp",
          "podman ps",
          "podman stats --no-stream myapp",
          "podman unpause myapp",
          "# SIGSTOP != kill — processes are frozen, not dead",
          "# Memory is preserved — instant resume with no data loss",
          "# CPU usage drops to exactly 0% while paused",
        ],
        objectives:[
          {id:"p1",text:"Pause myapp (freeze all processes)",hint:"podman pause myapp",check:(h,s)=>s.containers["myapp"]?.status==="Paused"},
          {id:"p2",text:"Unpause myapp",hint:"podman unpause myapp",check:(h,s)=>s.containers["myapp"]?.status?.startsWith("Up")},
        ]
      },
      {
        title:"4 · Remove & Commit",
        content:"rm deletes the container and its writable layer. -f force-removes even running containers. commit saves the current container state as a new image — useful for capturing manual changes.",
        examples:[
          "podman rm -f myapp",
          "podman container prune",
          "podman run -d --name snapshot nginx:alpine",
          "podman exec snapshot sh -c 'echo hello > /tmp/myfile'",
          "podman commit snapshot my-nginx:custom",
          "podman images",
          "# Committed image includes all filesystem changes",
          "# Better practice: use Containerfile/Dockerfile for reproducibility",
        ],
        objectives:[
          {id:"r1",text:"Force-remove the myapp container",hint:"podman rm -f myapp",check:(h,s)=>!s.containers["myapp"]},
          {id:"r2",text:"Prune all stopped containers",hint:"podman container prune",check:(h)=>h.some(c=>c==="podman container prune")},
        ]
      },
    ],
  },

  /* ════ LAB 3 ════════════════════════════════════════════════ */
  {
    id:"L3",icon:"⚙️",title:"Exec & Debugging",difficulty:"Beginner",xp:150,color:"var(--p)",
    desc:"Shell into containers, debug with logs, copy files, understand what's inside.",
    intro:"Being able to look inside a running container is your most important debugging skill. exec gives you a shell, logs gives you output, inspect gives you config, diff shows changes.",
    sections:[
      {
        title:"1 · Launch Debug Container",
        content:"Run nginx with environment variables. We'll read them back via exec to prove the container received them correctly.",
        examples:[
          "podman run -d --name debug -e APP_ENV=production -e DB_HOST=mydb.internal nginx:alpine",
          "podman ps",
          "# -e KEY=value sets environment variables",
          "# Use --env-file .env to load from a file",
        ],
        objectives:[
          {id:"d1",text:"Run 'debug' nginx with APP_ENV=production",hint:"podman run -d --name debug -e APP_ENV=production nginx:alpine",check:(h,s)=>!!s.containers["debug"]?.status?.startsWith("Up")},
        ]
      },
      {
        title:"2 · Execute Commands Inside",
        content:"exec runs any command inside a running container without disrupting it. -it gives interactive terminal access (like SSH). Read env vars, check filesystem, run diagnostics — all non-destructively.",
        examples:[
          "podman exec debug env",
          "podman exec debug ls /",
          "podman exec debug hostname",
          "podman exec debug cat /etc/os-release",
          "podman exec debug df -h",
          "podman exec -it debug sh",
          "# -it = interactive + tty (for shell sessions)",
          "# Without -it: runs command and exits immediately",
        ],
        objectives:[
          {id:"e1",text:"Read environment variables from debug container",hint:"podman exec debug env",check:(h)=>h.some(c=>c.includes("exec")&&c.includes("debug")&&c.includes("env"))},
          {id:"e2",text:"List the root filesystem inside debug",hint:"podman exec debug ls /",check:(h)=>h.some(c=>c.includes("exec")&&c.includes("debug")&&c.includes("ls"))},
          {id:"e3",text:"Check OS release info",hint:"podman exec debug cat /etc/os-release",check:(h)=>h.some(c=>c.includes("exec")&&c.includes("debug")&&c.includes("os-release"))},
        ]
      },
      {
        title:"3 · Logs, Stats & Processes",
        content:"logs streams stdout/stderr. --tail N limits output to last N lines. --follow streams live like 'tail -f'. stats shows real-time resource usage. top shows processes inside the container.",
        examples:[
          "podman logs debug",
          "podman logs --tail 5 debug",
          "podman logs -f debug",
          "podman stats --no-stream debug",
          "podman top debug",
          "podman diff debug",
          "# diff shows: C=Changed, A=Added, D=Deleted files",
        ],
        objectives:[
          {id:"l1",text:"Show last 5 log lines from debug",hint:"podman logs --tail 5 debug",check:(h)=>h.some(c=>c.includes("logs")&&c.includes("debug"))},
          {id:"l2",text:"Check resource usage (one-shot stats)",hint:"podman stats --no-stream debug",check:(h)=>h.some(c=>c.includes("stats")&&c.includes("debug"))},
          {id:"l3",text:"Show filesystem changes with diff",hint:"podman diff debug",check:(h)=>h.some(c=>c.includes("diff debug"))},
        ]
      },
      {
        title:"4 · File Operations",
        content:"cp copies files between host and container in both directions. Use it to inject configs, extract logs, or get files out of a stopped container without starting it. rename gives a container a new name without recreating it.",
        examples:[
          "podman cp debug:/etc/nginx/nginx.conf ./nginx-backup.conf",
          "podman cp ./myconfig.conf debug:/etc/nginx/",
          "podman rename debug debugger",
          "podman rename debugger debug",
          "podman commit debug debug-snapshot:v1",
          "podman images",
          "# cp works even on stopped containers",
          "# commit captures current filesystem state as a new image",
        ],
        objectives:[
          {id:"f1",text:"Copy nginx.conf from debug to host",hint:"podman cp debug:/etc/nginx/nginx.conf ./nginx-backup.conf",check:(h)=>h.some(c=>c.includes("cp")&&c.includes("debug"))},
          {id:"f2",text:"Rename the debug container",hint:"podman rename debug debugger",check:(h)=>h.some(c=>c.includes("rename")&&c.includes("debug"))},
        ]
      },
    ],
  },

  /* ════ LAB 4 ════════════════════════════════════════════════ */
  {
    id:"L4",icon:"🌐",title:"Networking",difficulty:"Intermediate",xp:200,color:"var(--c)",
    desc:"Custom networks, DNS resolution by name, port mapping, multi-container communication.",
    intro:"Podman 4+ uses Netavark + aardvark-dns. Containers on the same network resolve each other by container name — no /etc/hosts, no IPs needed. This is how microservices talk in production.",
    sections:[
      {
        title:"1 · Create Custom Networks",
        content:"The default 'podman' network works, but custom networks isolate app traffic and enable clean DNS-based service discovery. Create separate networks for frontend/backend separation.",
        examples:[
          "podman network create appnet",
          "podman network create --subnet 192.168.100.0/24 dbnet",
          "podman network create --internal private-net",
          "podman network ls",
          "podman network inspect appnet",
          "# --internal = no external access (isolated)",
          "# --subnet = specify the IP range",
        ],
        objectives:[
          {id:"n1",text:"Create a network called 'appnet'",hint:"podman network create appnet",check:(h,s)=>!!s.networks["appnet"]},
          {id:"n2",text:"List all networks",hint:"podman network ls",check:(h)=>h.some(c=>c==="podman network ls")},
        ]
      },
      {
        title:"2 · Connect Containers by Name",
        content:"Containers on the same network resolve each other by their --name. The 'db' container is reachable as hostname 'db'. No IP addresses, no /etc/hosts edits. aardvark-dns handles it automatically.",
        examples:[
          "podman run -d --name db --network appnet -e POSTGRES_PASSWORD=secret postgres:15-alpine",
          "podman run -d --name api --network appnet node:20-alpine",
          "podman network inspect appnet",
          "podman inspect db",
          "# api container resolves 'db' via aardvark-dns",
          "# Connection string: postgresql://postgres:secret@db:5432/myapp",
        ],
        objectives:[
          {id:"c1",text:"Run 'db' postgres on appnet",hint:"podman run -d --name db --network appnet -e POSTGRES_PASSWORD=secret postgres:15-alpine",check:(h,s)=>s.containers["db"]?.network==="appnet"},
          {id:"c2",text:"Run 'api' node on appnet",hint:"podman run -d --name api --network appnet node:20-alpine",check:(h,s)=>s.containers["api"]?.network==="appnet"},
        ]
      },
      {
        title:"3 · Test DNS & Connectivity",
        content:"Exec into a container and ping another by name. aardvark-dns handles the resolution. If they're on different networks, DNS fails — a feature, not a bug. Connect to both networks if needed.",
        examples:[
          "podman exec api ping db",
          "podman exec api curl http://db",
          "podman network inspect appnet",
          "podman network connect appnet debug",
          "podman network disconnect appnet debug",
          "# ping db → aardvark-dns resolves to db's IP",
          "# Networks provide isolation — wrong network = no access",
        ],
        objectives:[
          {id:"d1",text:"Ping 'db' from inside the 'api' container",hint:"podman exec api ping db",check:(h)=>h.some(c=>c.includes("exec")&&c.includes("api")&&c.includes("ping")&&c.includes("db"))},
          {id:"d2",text:"Inspect appnet to see connected containers",hint:"podman network inspect appnet",check:(h)=>h.some(c=>c.includes("network inspect appnet"))},
        ]
      },
      {
        title:"4 · Port Mapping & Security",
        content:"Expose only what's needed. Bind to 127.0.0.1 to restrict to localhost. Use port ≥1024 in rootless mode. Never expose databases directly — access them through the app container via internal DNS.",
        examples:[
          "podman run -d --name proxy -p 8080:80 nginx:alpine",
          "podman run -d --name admin -p 127.0.0.1:9090:9090 nginx:alpine",
          "podman port proxy",
          "podman run -d --name db2 --network appnet postgres:15-alpine -e POSTGRES_PASSWORD=x",
          "# 127.0.0.1:9090 = only accessible on local machine",
          "# No -p on db = only accessible inside appnet (correct!)",
          "# Never expose DB ports to 0.0.0.0 in production",
        ],
        objectives:[
          {id:"p1",text:"Run 'proxy' nginx with port 8080:80",hint:"podman run -d --name proxy -p 8080:80 nginx:alpine",check:(h,s)=>Object.keys(s.containers["proxy"]?.ports||{}).length>0},
          {id:"p2",text:"Check port mappings for proxy",hint:"podman port proxy",check:(h)=>h.some(c=>c.includes("port proxy"))},
        ]
      },
    ],
  },

  /* ════ LAB 5 ════════════════════════════════════════════════ */
  {
    id:"L5",icon:"💾",title:"Volumes & Storage",difficulty:"Intermediate",xp:200,color:"var(--y)",
    desc:"Named volumes, bind mounts, SELinux :Z labels, backup and restore.",
    intro:"Containers are ephemeral — data in the container layer disappears on removal. Volumes persist. On RHEL/CentOS/Fedora with SELinux enforcing, bind mounts silently fail without :Z.",
    sections:[
      {
        title:"1 · Named Volumes",
        content:"Named volumes are managed by Podman and persist independently of containers. They survive container removal, updates, and rebuilds. Stored under ~/.local/share/containers/storage/volumes/ in rootless mode.",
        examples:[
          "podman volume create pgdata",
          "podman volume create appdata",
          "podman volume ls",
          "podman volume inspect pgdata",
          "# Volume data persists even after: podman rm -f mycontainer",
          "# Stored at: ~/.local/share/containers/storage/volumes/pgdata/_data",
        ],
        objectives:[
          {id:"v1",text:"Create a named volume called 'pgdata'",hint:"podman volume create pgdata",check:(h,s)=>!!s.volumes["pgdata"]},
          {id:"v2",text:"Inspect the pgdata volume",hint:"podman volume inspect pgdata",check:(h)=>h.some(c=>c.includes("volume inspect pgdata"))},
        ]
      },
      {
        title:"2 · Mount Volume to Database",
        content:"Mount the volume at Postgres's data directory. Data written there persists across container removal and recreation. Remove and re-create the container — your data survives.",
        examples:[
          "podman run -d --name db -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=secret postgres:15-alpine",
          "podman ps",
          "podman volume ls",
          "podman exec db psql -U postgres -c 'SELECT version();'",
          "# Remove and re-create: data survives in pgdata volume",
          "# podman rm -f db  →  podman run ... same -v pgdata:...  = data still there",
        ],
        objectives:[
          {id:"m1",text:"Run postgres using the pgdata volume",hint:"podman run -d --name db -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=secret postgres:15-alpine",check:(h,s)=>!!s.containers["db"]&&(s.containers["db"]?.volumes||[]).some(v=>v.includes("pgdata"))},
          {id:"m2",text:"Verify with podman volume ls",hint:"podman volume ls",check:(h)=>h.some(c=>c==="podman volume ls")},
        ]
      },
      {
        title:"3 · Bind Mounts & SELinux",
        content:"Bind mounts map a host path directly into the container. CRITICAL on RHEL/CentOS/Fedora: add :Z for private SELinux label or :z for shared. Without this, SELinux silently denies access — no error message!",
        examples:[
          "podman run -d --name web2 -v ./html:/usr/share/nginx/html:Z nginx:alpine",
          "podman run -d --name web3 -v ./conf:/etc/nginx/conf.d:ro,Z nginx:alpine",
          "podman run -d --name dev --userns=keep-id -v ./src:/app:Z node:20-alpine",
          "# :Z = private SELinux relabel (one container only)",
          "# :z = shared SELinux relabel (multiple containers)",
          "# :ro = read-only mount",
          "# --userns=keep-id = your UID maps 1:1 (dev environments)",
        ],
        objectives:[
          {id:"b1",text:"Run container with :Z SELinux-labeled bind mount",hint:"podman run -d --name web2 -v ./html:/usr/share/nginx/html:Z nginx:alpine",check:(h)=>h.some(c=>c.includes(":Z")||c.includes(":z"))},
          {id:"b2",text:"Run dev container with --userns=keep-id",hint:"podman run -d --name dev --userns=keep-id -v ./src:/app:Z node:20-alpine",check:(h)=>h.some(c=>c.includes("keep-id"))},
        ]
      },
      {
        title:"4 · Backup & Restore",
        content:"Export volumes to tar for backup, migration, or sharing. Import to restore. This is the correct way to migrate databases between hosts. Note: 'podman rm -v' only removes anonymous volumes, NOT named volumes.",
        examples:[
          "podman volume export pgdata -o pgdata-backup.tar",
          "podman volume create pgdata-restore",
          "podman volume import pgdata-restore pgdata-backup.tar",
          "podman volume rm pgdata-restore",
          "podman volume prune",
          "# Backup pipeline: export | gzip > backup.tar.gz",
          "# Named volumes survive: podman rm, podman rm -v, podman system prune",
          "# Remove explicitly: podman volume rm vol  OR  podman volume prune",
        ],
        objectives:[
          {id:"bk1",text:"Export the pgdata volume to a tar file",hint:"podman volume export pgdata -o pgdata-backup.tar",check:(h)=>h.some(c=>c.includes("volume export"))},
          {id:"bk2",text:"List all volumes",hint:"podman volume ls",check:(h)=>h.some(c=>c==="podman volume ls")},
        ]
      },
    ],
  },

  /* ════ LAB 6 ════════════════════════════════════════════════ */
  {
    id:"L6",icon:"🫛",title:"Pods",difficulty:"Advanced",xp:300,color:"var(--o)",
    desc:"Create pods, add sidecars, pod lifecycle, export to Kubernetes YAML.",
    intro:"Pods are groups of containers sharing the same network namespace. They communicate via localhost — no DNS hop, no network latency. Mirrors Kubernetes pods exactly. Deploy locally, migrate to K8s with one command.",
    sections:[
      {
        title:"1 · Create a Pod",
        content:"A pod owns its network namespace via an infra (pause) container. Port mappings go on the POD — not on individual containers. Think of the pod as the 'virtual machine' and containers as 'processes' inside it.",
        examples:[
          "podman pod create --name webapp -p 8080:80",
          "podman pod create --name fullstack -p 3000:3000 -p 5432:5432",
          "podman pod ls",
          "podman pod inspect webapp",
          "# Infra container (pause) holds the network namespace",
          "# All containers in pod share: network, IPC, UTS namespaces",
          "# Port maps go on POD, not containers",
        ],
        objectives:[
          {id:"p1",text:"Create pod 'webapp' with port 8080:80",hint:"podman pod create --name webapp -p 8080:80",check:(h,s)=>!!s.pods["webapp"]},
          {id:"p2",text:"List all pods",hint:"podman pod ls",check:(h)=>h.some(c=>c==="podman pod ls")},
        ]
      },
      {
        title:"2 · Add Containers to Pod",
        content:"Use --pod to add containers. They instantly share the network namespace — nginx and a backend communicate on localhost. No port exposure needed between them. The infra container owns the ports.",
        examples:[
          "podman run -d --pod webapp --name nginx nginx:alpine",
          "podman run -d --pod webapp --name metrics redis:7-alpine",
          "podman ps -a",
          "podman pod inspect webapp",
          "# nginx reaches metrics via: redis-cli -h 127.0.0.1 -p 6379",
          "# No --network needed — pod containers share it automatically",
          "# Order matters: start all containers before stopping pod",
        ],
        objectives:[
          {id:"c1",text:"Add nginx container to webapp pod",hint:"podman run -d --pod webapp --name nginx nginx:alpine",check:(h,s)=>!!s.containers["nginx"]&&s.containers["nginx"]?.pod==="webapp"},
          {id:"c2",text:"Add redis sidecar to pod",hint:"podman run -d --pod webapp --name metrics redis:7-alpine",check:(h,s)=>!!s.containers["metrics"]&&s.containers["metrics"]?.pod==="webapp"},
          {id:"c3",text:"List all containers in pod",hint:"podman ps -a",check:(h)=>h.some(c=>c==="podman ps -a")},
        ]
      },
      {
        title:"3 · Pod Lifecycle",
        content:"Pod stop/start/restart affects ALL containers simultaneously — they're one unit. Pod stats shows aggregated resource usage across all containers. Inspect reveals the full pod configuration.",
        examples:[
          "podman pod stop webapp",
          "podman pod ls",
          "podman pod start webapp",
          "podman pod stats webapp",
          "podman pod inspect webapp",
          "podman pod restart webapp",
          "# Stop order: containers first, then infra",
          "# Start order: infra first, then containers",
        ],
        objectives:[
          {id:"l1",text:"Stop the webapp pod (stops all containers)",hint:"podman pod stop webapp",check:(h,s)=>s.pods["webapp"]?.status==="Stopped"},
          {id:"l2",text:"Start webapp pod again",hint:"podman pod start webapp",check:(h,s)=>s.pods["webapp"]?.status==="Running"},
          {id:"l3",text:"Inspect the webapp pod",hint:"podman pod inspect webapp",check:(h)=>h.some(c=>c.includes("pod inspect webapp"))},
        ]
      },
      {
        title:"4 · Export to Kubernetes YAML",
        content:"'generate kube' outputs a valid K8s Pod YAML from your running pod. Zero manifest writing — Podman reads your containers and generates production-ready YAML. Develop locally, deploy to Kubernetes.",
        examples:[
          "podman generate kube webapp",
          "podman generate kube webapp > webapp.yaml",
          "podman play kube webapp.yaml",
          "podman play kube --down webapp.yaml",
          "podman pod rm -f webapp",
          "# Generated YAML is valid Kubernetes PodSpec",
          "# kubectl apply -f webapp.yaml deploys to K8s",
          "# podman play kube re-creates locally from YAML",
        ],
        objectives:[
          {id:"k1",text:"Generate Kubernetes YAML from webapp",hint:"podman generate kube webapp",check:(h)=>h.some(c=>c.includes("generate kube webapp"))},
        ]
      },
    ],
  },

  /* ════ LAB 7 ════════════════════════════════════════════════ */
  {
    id:"L7",icon:"🔒",title:"Rootless Security",difficulty:"Advanced",xp:350,color:"var(--r)",
    desc:"User namespaces, UID mapping, capabilities, seccomp, security best practices.",
    intro:"Rootless is Podman's security advantage. Container root ≠ host root. A container escape gives attackers only your unprivileged user account. Understanding this deeply is essential for enterprise security.",
    sections:[
      {
        title:"1 · UID Namespace Mapping",
        content:"The Linux kernel maps container UIDs to host UIDs via /etc/subuid. Container UID 0 (root) maps to your host UID 100000 — an unprivileged account. A container escape is now completely isolated.",
        examples:[
          "podman run --rm alpine id",
          "podman run --rm alpine cat /proc/self/uid_map",
          "podman run --rm alpine cat /proc/1/status",
          "podman unshare id",
          "# Container: uid=0(root) → Host: uid=100000 (unprivileged)",
          "# /proc/self/uid_map format: container_start  host_start  count",
          "# 0  100000  65536 = 65536 UIDs available",
        ],
        objectives:[
          {id:"u1",text:"Check container UID (should show root inside)",hint:"podman run --rm alpine id",check:(h)=>h.some(c=>c.includes("run")&&c.includes("alpine")&&c.includes("id"))},
          {id:"u2",text:"Read the UID namespace map",hint:"podman run --rm alpine cat /proc/self/uid_map",check:(h)=>h.some(c=>c.includes("uid_map"))},
          {id:"u3",text:"Enter user namespace with podman unshare",hint:"podman unshare id",check:(h)=>h.some(c=>c.includes("unshare"))},
        ]
      },
      {
        title:"2 · Fix Bind Mount Ownership",
        content:"Without --userns=keep-id, files created in a container appear owned by UID 100000 on the host (your subuid). --userns=keep-id maps your UID 1:1 — files appear owned by you. Essential for development workflows.",
        examples:[
          "podman run --rm alpine id",
          "podman run --rm --userns=keep-id alpine id",
          "podman run --rm --userns=keep-id -v ./data:/data:Z alpine id",
          "podman unshare chown -R 0:0 ./mydir",
          "# Without keep-id: ls -la shows 100000 as owner",
          "# With keep-id: ls -la shows your username as owner",
          "# unshare chown: fix ownership from user namespace",
        ],
        objectives:[
          {id:"k1",text:"Run with --userns=keep-id (your UID in container)",hint:"podman run --rm --userns=keep-id alpine id",check:(h)=>h.some(c=>c.includes("keep-id"))},
          {id:"k2",text:"Use podman unshare to fix file ownership",hint:"podman unshare chown -R 0:0 ./mydir",check:(h)=>h.some(c=>c.includes("unshare")&&c.includes("chown"))},
        ]
      },
      {
        title:"3 · Linux Capabilities",
        content:"Linux capabilities break root into ~40 granular privileges. --cap-drop ALL removes everything. Add back only what's required. This prevents privilege escalation attacks even if the container is compromised.",
        examples:[
          "podman run --rm --cap-drop ALL alpine sh",
          "podman run --rm --cap-drop ALL --cap-add NET_BIND_SERVICE nginx:alpine",
          "podman run --rm --security-opt no-new-privileges alpine id",
          "podman run --rm --read-only alpine id",
          "podman run --rm --read-only --tmpfs /tmp:rw alpine sh",
          "# NET_BIND_SERVICE = allow binding ports <1024",
          "# no-new-privileges = block setuid/setgid escalation",
          "# --read-only = immutable container filesystem",
        ],
        objectives:[
          {id:"c1",text:"Drop all capabilities",hint:"podman run --rm --cap-drop ALL alpine sh",check:(h)=>h.some(c=>c.includes("cap-drop"))},
          {id:"c2",text:"Add no-new-privileges security option",hint:"podman run --rm --security-opt no-new-privileges alpine id",check:(h)=>h.some(c=>c.includes("no-new-privileges"))},
          {id:"c3",text:"Run with read-only filesystem",hint:"podman run --rm --read-only alpine id",check:(h)=>h.some(c=>c.includes("read-only"))},
        ]
      },
      {
        title:"4 · Security Hardening Checklist",
        content:"Production security baseline: combine rootless + cap-drop + no-new-privileges + read-only + non-root user. This is defense-in-depth. Each layer adds protection even if others fail.",
        examples:[
          "podman run --rm --cap-drop ALL --security-opt no-new-privileges --read-only --user 1000:1000 alpine id",
          "podman system info",
          "podman version",
          "podman search --filter=is-official nginx",
          "# Full hardening: rootless + cap-drop + no-new-privs + read-only + non-root user",
          "# --user 1000:1000 = run as non-root even inside container",
          "# Use trusted images: docker.io/library/* = official Docker Library",
        ],
        objectives:[
          {id:"h1",text:"Run fully hardened container (cap-drop + no-new-privileges + read-only)",hint:"podman run --rm --cap-drop ALL --security-opt no-new-privileges --read-only alpine id",check:(h)=>h.some(c=>c.includes("cap-drop")&&c.includes("no-new-privileges")&&c.includes("read-only"))},
          {id:"h2",text:"Check security settings in system info",hint:"podman system info",check:(h)=>h.some(c=>c.includes("system info"))},
        ]
      },
    ],
  },

  /* ════ LAB 8 ════════════════════════════════════════════════ */
  {
    id:"L8",icon:"📦",title:"Build & Registry",difficulty:"Advanced",xp:200,color:"var(--t2)",
    desc:"Build OCI images, multi-stage builds, tag, push, save/load for air-gapped environments.",
    intro:"Building images is how you package your applications. Podman uses Buildah under the hood — the same OCI format as Docker. Multi-stage builds minimize image size. Tags identify specific versions.",
    sections:[
      {
        title:"1 · Build an Image",
        content:"Podman builds from a Containerfile (or Dockerfile — same syntax). Multi-stage builds compile in one stage and copy only the binary to a minimal final image, dramatically reducing size and attack surface.",
        examples:[
          "podman build -t myapp:1.0 .",
          "podman build -t myapp:1.0 -f Containerfile.prod .",
          "podman build -t myapp:1.0 --no-cache .",
          "podman images",
          "podman history myapp:1.0",
          "# --no-cache = force fresh build",
          "# Multi-stage: FROM builder AS build, FROM alpine AS final, COPY --from=build",
        ],
        objectives:[
          {id:"b1",text:"Build image tagged myapp:1.0",hint:"podman build -t myapp:1.0 .",check:(h,s)=>!!s.images["myapp:1.0"]},
          {id:"b2",text:"View layer history of built image",hint:"podman history myapp:1.0",check:(h)=>h.some(c=>c.includes("history")&&c.includes("myapp"))},
        ]
      },
      {
        title:"2 · Tag & Push to Registry",
        content:"Tags identify versions. Format: registry/org/name:tag. Push requires login first. Quay.io is Red Hat's registry — free for public images. Use 'latest' + version tags simultaneously.",
        examples:[
          "podman tag myapp:1.0 quay.io/myorg/myapp:1.0",
          "podman tag myapp:1.0 quay.io/myorg/myapp:latest",
          "podman images",
          "podman login quay.io",
          "podman push quay.io/myorg/myapp:1.0",
          "podman push quay.io/myorg/myapp:latest",
          "# Always tag with version AND latest",
          "# quay.io = Red Hat registry (free public repos)",
        ],
        objectives:[
          {id:"t1",text:"Tag myapp:1.0 for quay.io",hint:"podman tag myapp:1.0 quay.io/myorg/myapp:1.0",check:(h,s)=>!!s.images["quay.io/myorg/myapp:1.0"]},
          {id:"t2",text:"Push image to registry",hint:"podman push quay.io/myorg/myapp:1.0",check:(h)=>h.some(c=>c.includes("push"))},
        ]
      },
      {
        title:"3 · Save & Load (Air-gapped)",
        content:"Save exports an image to a tar file — no registry needed. Essential for air-gapped (offline) environments, CI artifacts, and distributing images without a registry. Load imports the tar back.",
        examples:[
          "podman save -o myapp.tar myapp:1.0",
          "podman rmi myapp:1.0",
          "podman load -i myapp.tar",
          "podman images",
          "podman save myapp:1.0 | gzip > myapp.tar.gz",
          "# Air-gapped: copy tar to offline machine, then: podman load -i",
          "# Includes all layers — completely self-contained",
        ],
        objectives:[
          {id:"s1",text:"Save myapp:1.0 to a tar file",hint:"podman save -o myapp.tar myapp:1.0",check:(h)=>h.some(c=>c.includes("save")&&c.includes("myapp"))},
          {id:"s2",text:"Load the image back from tar",hint:"podman load -i myapp.tar",check:(h)=>h.some(c=>c.includes("load"))},
        ]
      },
      {
        title:"4 · Cleanup & Disk Management",
        content:"Images accumulate quickly. system df shows exact disk usage. prune removes unused resources. 'image prune -a' removes all images not used by a container. Regular cleanup prevents disk exhaustion.",
        examples:[
          "podman system df",
          "podman images",
          "podman image prune -a",
          "podman system prune -a",
          "podman rmi myapp:1.0",
          "podman search --filter=is-official python",
          "# system prune -a: stops all stopped ctrs + unused images + unused nets",
          "# Workflow: podman system df → review → podman system prune",
        ],
        objectives:[
          {id:"d1",text:"Check disk usage with system df",hint:"podman system df",check:(h)=>h.some(c=>c==="podman system df")},
          {id:"d2",text:"Search for Python images on registries",hint:"podman search python",check:(h)=>h.some(c=>c.includes("search"))},
        ]
      },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────
   TERMINAL COMPONENT
───────────────────────────────────────────────────────────── */
const TERM_COLORS = {ok:"#34d058",err:"#f87171",info:"#4da6ff",warn:"#f0b429",dim:"#4a6075",hdr:"#f0b429",sec:"#a78bfa",bdr:"#344558",out:"#c8d8e8",prompt:"#34d058"};

function TermLine({t,k}){
  return <div style={{fontFamily:"var(--mono)",fontSize:12.5,lineHeight:"1.8",color:TERM_COLORS[k]||TERM_COLORS.out,whiteSpace:"pre-wrap",wordBreak:"break-all"}}>{t}</div>;
}

const COMPLETIONS = [
  "podman version","podman info","podman system info","podman system df","podman system prune -a",
  "podman search ","podman pull nginx:alpine","podman pull alpine","podman pull postgres:15-alpine","podman pull redis:7-alpine","podman pull node:20-alpine",
  "podman images","podman image prune -a",
  "podman build -t ","podman tag ","podman push ","podman save -o ","podman load -i ","podman history ",
  "podman run -d --name ","podman run -it --rm alpine sh","podman run --rm alpine id","podman run --rm alpine cat /proc/self/uid_map",
  "podman run --rm --userns=keep-id alpine id","podman run --rm --cap-drop ALL alpine sh","podman run --rm --security-opt no-new-privileges alpine id",
  "podman ps","podman ps -a","podman stop ","podman start ","podman restart ","podman pause ","podman unpause ","podman kill ",
  "podman rm -f ","podman container prune","podman rename ","podman commit ","podman diff ","podman wait ","podman events",
  "podman exec -it ","podman exec ","podman logs ","podman logs --tail 20 ","podman logs -f ","podman stats --no-stream","podman top ","podman port ","podman inspect ","podman cp ",
  "podman network create ","podman network ls","podman network inspect ","podman network connect ","podman network disconnect ","podman network rm ","podman network prune",
  "podman volume create ","podman volume ls","podman volume inspect ","podman volume rm ","podman volume prune","podman volume export -o ","podman volume import ",
  "podman pod create --name ","podman pod ls","podman pod inspect ","podman pod stop ","podman pod start ","podman pod restart ","podman pod rm -f ","podman pod stats ",
  "podman generate kube ","podman play kube ","podman play kube --down ",
  "podman login","podman logout","podman unshare id","podman unshare chown",
  "clear","help",
];

function Terminal({lines,onCmd,histRef,suggestions=[],autoFocusKey=0}){
  const[input,setInput]=useState("");
  const[hIdx,setHIdx]=useState(-1);
  const bottomRef=useRef(null);
  const inputRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[lines]);
  useEffect(()=>{if(inputRef.current)inputRef.current.focus();},[autoFocusKey]);

  const commit=useCallback((cmd)=>{
    setInput("");setHIdx(-1);onCmd(cmd);
  },[onCmd]);

  const handleKey=useCallback((e)=>{
    if(e.key==="Enter"){const c=input.trim();commit(c);}
    else if(e.key==="ArrowUp"){
      e.preventDefault();
      const h=histRef.current||[];
      const ni=Math.min(hIdx+1,h.length-1);
      setHIdx(ni);if(h[ni]!==undefined)setInput(h[ni]);
    }
    else if(e.key==="ArrowDown"){
      e.preventDefault();
      const ni=hIdx-1;
      if(ni<0){setInput("");setHIdx(-1);}
      else{const h=histRef.current||[];if(h[ni])setInput(h[ni]);setHIdx(ni);}
    }
    else if(e.key==="Tab"){
      e.preventDefault();
      const m=COMPLETIONS.find(c=>c.startsWith(input)&&c!==input);
      if(m)setInput(m);
    }
    else if(e.ctrlKey&&e.key==="l"){
      e.preventDefault();onCmd("clear");
    }
  },[input,hIdx,histRef,commit,onCmd]);

  const pills=suggestions.length?suggestions:["podman ps","podman images","podman system df","help","clear"];

  return(
    <div style={{background:"#05080d",border:"1px solid var(--b0)",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%",boxShadow:"0 0 0 1px var(--b0), 0 8px 32px rgba(0,0,0,.7)"}}>
      {/* Mac-style title bar */}
      <div style={{background:"#0d1219",padding:"9px 14px",borderBottom:"1px solid var(--b0)",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <div style={{display:"flex",gap:5}}>
          {["#ff5f57","#febc2e","#28c840"].map(c=><div key={c} style={{width:11,height:11,borderRadius:"50%",background:c,flexShrink:0}}/>)}
        </div>
        <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",marginLeft:6,flex:1,textAlign:"center"}}>podman-lab — rootless user namespace</span>
        <div style={{display:"flex",gap:5}}>
          <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--g)",background:"rgba(52,208,88,0.1)",border:"1px solid rgba(52,208,88,0.25)",padding:"1px 7px",borderRadius:3}}>● ROOTLESS</span>
          <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--c)",background:"rgba(77,166,255,0.1)",border:"1px solid rgba(77,166,255,0.25)",padding:"1px 7px",borderRadius:3}}>v4.9.3</span>
        </div>
      </div>
      {/* Output */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",cursor:"text",background:"#05080d"}} onClick={()=>inputRef.current?.focus()}>
        {lines.map((l,i)=><TermLine key={i} t={l.t} k={l.k}/>)}
        <div ref={bottomRef}/>
      </div>
      {/* Input row */}
      <div style={{background:"#080c12",borderTop:"1px solid var(--b0)",padding:"8px 14px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--g)",whiteSpace:"nowrap",flexShrink:0}}>max@lab:~$</span>
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
          spellCheck={false} autoComplete="off"
          style={{flex:1,background:"transparent",border:"none",outline:"none",fontFamily:"var(--mono)",fontSize:12,color:"var(--t1)",caretColor:"var(--c)"}}
          placeholder="type a command… (Tab autocomplete  ·  ↑↓ history  ·  Ctrl+L clear)"/>
      </div>
      {/* Quick-run pills */}
      <div style={{background:"#080c12",borderTop:"1px solid rgba(30,39,54,.8)",padding:"5px 12px",display:"flex",flexWrap:"wrap",gap:4,flexShrink:0}}>
        {pills.map(s=>(
          <button key={s} onClick={()=>commit(s)}
            style={{fontFamily:"var(--mono)",fontSize:10,padding:"2px 8px",border:"1px solid var(--b1)",borderRadius:3,background:"var(--s2)",color:"var(--t3)",lineHeight:1.5,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--c)";e.currentTarget.style.color="var(--c)";e.currentTarget.style.background="var(--ca)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b1)";e.currentTarget.style.color="var(--t3)";e.currentTarget.style.background="var(--s2)";}}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   LAB VIEW
───────────────────────────────────────────────────────────── */
function LabView({lab,history,es,onComplete}){
  const[si,setSi]=useState(0);
  const sec=lab.sections[si];

  const objDone=(obj)=>obj.check(history,es);
  const secDone=(s)=>s.objectives.every(objDone);
  const labDone=lab.sections.every(secDone);
  const totalO=lab.sections.reduce((a,s)=>a+s.objectives.length,0);
  const doneO=lab.sections.reduce((a,s)=>a+s.objectives.filter(objDone).length,0);
  const pct=Math.round(doneO/totalO*100);

  useEffect(()=>{if(labDone)onComplete(lab.id,lab.xp);},[labDone]);

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"var(--s0)"}}>
      {/* Lab header */}
      <div style={{padding:"12px 14px 0",flexShrink:0,background:"var(--s1)",borderBottom:"1px solid var(--b0)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:17}}>{lab.icon}</span>
            <span style={{fontFamily:"var(--head)",fontSize:14,fontWeight:700}}>{lab.title}</span>
            <span style={{fontFamily:"var(--mono)",fontSize:9,padding:"2px 8px",borderRadius:10,
              background:lab.difficulty==="Beginner"?"rgba(52,208,88,.12)":lab.difficulty==="Intermediate"?"rgba(240,180,41,.12)":"rgba(248,113,113,.12)",
              color:lab.difficulty==="Beginner"?"var(--g)":lab.difficulty==="Intermediate"?"var(--y)":"var(--r)"}}>{lab.difficulty}</span>
          </div>
          <span style={{fontFamily:"var(--head)",fontSize:13,fontWeight:700,color:"var(--o)"}}>+{lab.xp}XP</span>
        </div>
        {/* progress bar */}
        <div style={{height:2,background:"var(--b0)",marginBottom:0}}>
          <div style={{height:"100%",background:labDone?"var(--g)":lab.color,width:pct+"%",transition:"width .4s ease"}}/>
        </div>
        {/* section tabs */}
        <div style={{display:"flex",gap:0,overflowX:"auto",marginTop:0}}>
          {lab.sections.map((s,i)=>{
            const done=secDone(s);const act=i===si;
            return(
              <button key={i} onClick={()=>setSi(i)}
                style={{padding:"7px 12px",fontFamily:"var(--sans)",fontSize:11,fontWeight:500,
                  color:act?lab.color:done?"var(--g)":"var(--t3)",
                  background:"transparent",border:"none",borderBottom:`2px solid ${act?lab.color:done?"var(--g)":"transparent"}`,
                  whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:4,cursor:"pointer",transition:"all .15s"}}>
                {done&&<span style={{fontSize:9,color:"var(--g)"}}>✓</span>}{s.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section body */}
      <div style={{flex:1,overflowY:"auto",padding:"14px"}}>
        {/* Concept */}
        <div style={{marginBottom:12,padding:"10px 13px",background:"rgba(77,166,255,.05)",border:"1px solid rgba(77,166,255,.14)",borderRadius:6,fontFamily:"var(--sans)",fontSize:12.5,color:"var(--t2)",lineHeight:1.75}}>
          {sec.content}
        </div>
        {/* Examples */}
        {sec.examples?.length>0&&(
          <div style={{marginBottom:13}}>
            <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:2,marginBottom:5}}>Examples</div>
            <div style={{background:"#05080d",border:"1px solid var(--b0)",borderRadius:6,padding:"10px 13px"}}>
              {sec.examples.map((ex,i)=>(
                <div key={i} style={{fontFamily:"var(--mono)",fontSize:11.5,lineHeight:1.9,color:ex.startsWith("#")?"var(--t3)":"var(--g)"}}>
                  {!ex.startsWith("#")&&<span style={{color:"var(--t4)",marginRight:6}}>$</span>}{ex}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Objectives */}
        <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:2,marginBottom:6}}>Objectives</div>
        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:14}}>
          {sec.objectives.map((obj,i)=>{
            const done=objDone(obj);
            return(
              <div key={obj.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 12px",
                background:done?"rgba(52,208,88,.05)":"var(--s2)",
                border:`1px solid ${done?"rgba(52,208,88,.2)":"var(--b0)"}`,
                borderRadius:5,transition:"all .3s",animation:done?"pop .3s ease":"none"}}>
                <div style={{width:18,height:18,borderRadius:"50%",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",
                  border:`1.5px solid ${done?"var(--g)":"var(--b2)"}`,
                  background:done?"rgba(52,208,88,.14)":"transparent",transition:"all .3s"}}>
                  {done?<span style={{color:"var(--g)",fontSize:10,fontWeight:700}}>✓</span>:<span style={{color:"var(--t3)",fontFamily:"var(--mono)",fontSize:9}}>{i+1}</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"var(--sans)",fontSize:12.5,color:done?"var(--g)":"var(--t1)",fontWeight:500}}>{obj.text}</div>
                  {!done&&<div style={{fontFamily:"var(--mono)",fontSize:10.5,color:"var(--t3)",marginTop:2}}>→ {obj.hint}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Next section btn */}
        {secDone(sec)&&si<lab.sections.length-1&&(
          <button onClick={()=>setSi(si+1)}
            style={{width:"100%",padding:"9px",background:"var(--ca)",border:"1px solid var(--cb)",borderRadius:5,
              fontFamily:"var(--sans)",fontSize:12,fontWeight:600,color:"var(--c)",marginBottom:10,transition:"background .15s"}}
            onMouseEnter={e=>e.target.style.background="rgba(77,166,255,.2)"}
            onMouseLeave={e=>e.target.style.background="var(--ca)"}>
            Next: {lab.sections[si+1].title} →
          </button>
        )}

        {/* Lab complete banner */}
        {labDone&&(
          <div style={{padding:"14px",background:"rgba(52,208,88,.07)",border:"1px solid rgba(52,208,88,.3)",borderRadius:6,textAlign:"center",animation:"pop .4s ease"}}>
            <div style={{fontSize:20,marginBottom:4}}>🏆</div>
            <div style={{fontFamily:"var(--head)",fontSize:15,fontWeight:700,color:"var(--g)"}}>Lab Complete! +{lab.xp} XP earned</div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{padding:"8px 14px",borderTop:"1px solid var(--b0)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,background:"var(--s1)"}}>
        <button onClick={()=>setSi(Math.max(0,si-1))} disabled={si===0}
          style={{fontFamily:"var(--sans)",fontSize:11,padding:"4px 10px",border:"1px solid var(--b1)",borderRadius:4,background:"transparent",color:si===0?"var(--t4)":"var(--t2)",cursor:si===0?"default":"pointer"}}>← Prev</button>
        <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)"}}>{doneO}/{totalO} objectives · {si+1}/{lab.sections.length}</span>
        <button onClick={()=>setSi(Math.min(lab.sections.length-1,si+1))} disabled={si===lab.sections.length-1}
          style={{fontFamily:"var(--sans)",fontSize:11,padding:"4px 10px",border:"1px solid var(--b1)",borderRadius:4,background:"transparent",color:si===lab.sections.length-1?"var(--t4)":"var(--t2)",cursor:si===lab.sections.length-1?"default":"pointer"}}>Next →</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────────────────────────── */
function Dashboard({es}){
  const up=Object.values(es.containers).filter(c=>c.status.startsWith("Up")).length;
  const paused=Object.values(es.containers).filter(c=>c.status==="Paused").length;
  const stopped=Object.values(es.containers).filter(c=>c.status.includes("Exited")).length;
  const Stat=({label,val,sub,color,icon})=>(
    <div style={{background:"var(--s2)",border:"1px solid var(--b0)",borderTop:`2px solid ${color}`,borderRadius:6,padding:"11px 13px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:2}}>{label}</span>
        <span style={{fontSize:13}}>{icon}</span>
      </div>
      <div style={{fontFamily:"var(--head)",fontSize:28,fontWeight:700,color,lineHeight:1}}>{val}</div>
      {sub&&<div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",marginTop:3}}>{sub}</div>}
    </div>
  );
  return(
    <div style={{padding:14,overflowY:"auto",height:"100%"}} className="au">
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        <Stat label="Containers" val={Object.keys(es.containers).length} sub={`${up} up · ${paused} paused · ${stopped} stopped`} color="var(--c)" icon="📦"/>
        <Stat label="Images"    val={Object.keys(es.images).length}      sub="local cache"  color="var(--p)" icon="🖼"/>
        <Stat label="Networks"  val={Object.keys(es.networks).length}    sub="bridge"       color="var(--g)" icon="🌐"/>
        <Stat label="Volumes"   val={Object.keys(es.volumes).length}     sub="named"        color="var(--y)" icon="💾"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {/* containers */}
        <div style={{background:"var(--s1)",border:"1px solid var(--b0)",borderRadius:7,overflow:"hidden"}}>
          <div style={{padding:"8px 12px",background:"var(--s2)",borderBottom:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:10,color:"var(--c)",display:"flex",justifyContent:"space-between"}}>
            <span>CONTAINERS</span><span style={{color:"var(--t3)"}}>{Object.keys(es.containers).length}</span>
          </div>
          {!Object.keys(es.containers).length
            ?<div style={{padding:"16px",fontFamily:"var(--mono)",fontSize:11,color:"var(--t3)",textAlign:"center"}}>No containers yet<br/><span style={{color:"var(--c)"}}>podman run -d --name web nginx:alpine</span></div>
            :<>
              <div style={{display:"grid",gridTemplateColumns:"90px 1fr 65px 90px",gap:6,padding:"5px 10px",fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",textTransform:"uppercase",letterSpacing:1,borderBottom:"1px solid var(--b0)"}}>
                <span>ID</span><span>NAME</span><span>STATUS</span><span>IMAGE</span>
              </div>
              {Object.entries(es.containers).map(([n,c])=>{
                const sc=c.status.startsWith("Up")?"var(--g)":c.status==="Paused"?"var(--y)":"var(--t3)";
                return(
                  <div key={n} style={{display:"grid",gridTemplateColumns:"90px 1fr 65px 90px",gap:6,padding:"6px 10px",borderBottom:"1px solid rgba(30,39,54,.5)",fontFamily:"var(--mono)",fontSize:11,alignItems:"center",transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{color:"var(--t3)"}}>{c.id.slice(0,10)}</span>
                    <span style={{color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span>
                    <span style={{display:"flex",alignItems:"center",gap:3,color:sc}}><span style={{width:5,height:5,borderRadius:"50%",background:sc,flexShrink:0}}/>{c.status.split(" ")[0]}</span>
                    <span style={{color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(c.image||"").split(":")[0].split("/").pop()}</span>
                  </div>
                );
              })}
            </>
          }
        </div>
        {/* Networks */}
        <div style={{background:"var(--s1)",border:"1px solid var(--b0)",borderRadius:7,overflow:"hidden"}}>
          <div style={{padding:"8px 12px",background:"var(--s2)",borderBottom:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:10,color:"var(--g)"}}>NETWORK TOPOLOGY</div>
          <div style={{padding:10}}>
            {Object.entries(es.networks).map(([nn,net])=>(
              <div key={nn} style={{marginBottom:8,border:"1px solid var(--b0)",borderRadius:5,overflow:"hidden"}}>
                <div style={{background:"var(--s2)",padding:"5px 10px",display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:"var(--c)",flexShrink:0}}/>
                  <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--c)",fontWeight:600}}>{nn}</span>
                  <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",marginLeft:4}}>{net.subnet}</span>
                </div>
                <div style={{padding:"6px 10px",display:"flex",flexWrap:"wrap",gap:5,minHeight:34}}>
                  {(net.containers||[]).filter(c=>es.containers[c]).map(cn=>{
                    const c=es.containers[cn];const up=c.status.startsWith("Up");
                    return(
                      <div key={cn} style={{padding:"3px 8px",border:`1px solid ${up?"rgba(52,208,88,.3)":"var(--b1)"}`,borderRadius:3,background:up?"rgba(52,208,88,.06)":"var(--s2)",fontFamily:"var(--mono)",fontSize:10}}>
                        <div style={{color:up?"var(--g)":"var(--t3)",fontWeight:600}}>{cn}</div>
                        <div style={{color:"var(--t3)",fontSize:9}}>{c.ip}</div>
                      </div>
                    );
                  })}
                  {!(net.containers||[]).filter(c=>es.containers[c]).length&&<span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)"}}>empty</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Images */}
        <div style={{background:"var(--s1)",border:"1px solid var(--b0)",borderRadius:7,overflow:"hidden"}}>
          <div style={{padding:"8px 12px",background:"var(--s2)",borderBottom:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:10,color:"var(--p)"}}>IMAGES</div>
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {Object.entries(es.images).map(([n,d])=>(
              <div key={n} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 12px",borderBottom:"1px solid rgba(30,39,54,.5)",fontFamily:"var(--mono)",fontSize:11,transition:"background .1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{color:"var(--t1)"}}>{n}</span>
                <div style={{display:"flex",gap:10,flexShrink:0}}>
                  <span style={{color:"var(--t3)"}}>{d.size}</span>
                  <span style={{color:"var(--t3)",minWidth:60}}>{d.created}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Volumes + Pods */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"var(--s1)",border:"1px solid var(--b0)",borderRadius:7,overflow:"hidden"}}>
            <div style={{padding:"8px 12px",background:"var(--s2)",borderBottom:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:10,color:"var(--y)"}}>VOLUMES</div>
            {!Object.keys(es.volumes).length
              ?<div style={{padding:"10px",fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)"}}>No volumes — try: <span style={{color:"var(--y)"}}>podman volume create mydata</span></div>
              :Object.entries(es.volumes).map(([v,d])=>(
                <div key={v} style={{display:"flex",justifyContent:"space-between",padding:"6px 12px",borderBottom:"1px solid rgba(30,39,54,.5)",fontFamily:"var(--mono)",fontSize:11}}>
                  <span style={{color:"var(--y)"}}>{v}</span><span style={{color:"var(--t3)"}}>{d.size}</span>
                </div>
              ))
            }
          </div>
          {Object.keys(es.pods).length>0&&(
            <div style={{background:"var(--s1)",border:"1px solid var(--b0)",borderRadius:7,overflow:"hidden"}}>
              <div style={{padding:"8px 12px",background:"var(--s2)",borderBottom:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:10,color:"var(--o)"}}>PODS</div>
              {Object.entries(es.pods).map(([n,p])=>(
                <div key={n} style={{display:"flex",justifyContent:"space-between",padding:"6px 12px",borderBottom:"1px solid rgba(30,39,54,.5)",fontFamily:"var(--mono)",fontSize:11}}>
                  <span style={{color:"var(--o)"}}>{n}</span>
                  <span style={{color:p.status==="Running"?"var(--g)":"var(--t3)"}}>{p.status} · {(p.containers||[]).length+1} ctrs</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CHEATSHEET
───────────────────────────────────────────────────────────── */
function Cheatsheet(){
  const secs=[
    {t:"Images",c:"var(--c)",rows:[["podman pull img:tag","Pull from registry"],["podman images","List local images"],["podman build -t tag .","Build OCI image"],["podman rmi img","Remove image"],["podman image prune -a","Remove all unused"],["podman tag src dst","Tag image"],["podman push reg/img","Push to registry"],["podman save -o f img","Export to tar"],["podman load -i f","Import from tar"],["podman history img","Layer history"],["podman search term","Search registries"],["podman inspect img","Full JSON metadata"]]},
    {t:"Containers",c:"var(--g)",rows:[["podman run -d --name x img","Run detached"],["podman run -it --rm img sh","Interactive, auto-remove"],["podman run --rm img cmd","One-shot command"],["podman ps","List running"],["podman ps -a","List all (incl. stopped)"],["podman stop name","Stop (SIGTERM)"],["podman kill -s KILL name","Kill (SIGKILL)"],["podman start name","Start stopped"],["podman restart name","Restart"],["podman pause/unpause n","Freeze/thaw (SIGSTOP)"],["podman rm -f name","Force remove"],["podman rename old new","Rename"],["podman commit n img","Save container as image"],["podman diff n","Show filesystem changes"],["podman wait name","Wait for exit"],["podman container prune","Remove all stopped"]]},
    {t:"Exec & Inspect",c:"var(--p)",rows:[["podman exec -it n sh","Shell in container"],["podman exec n cmd","Run command"],["podman logs -f name","Follow logs"],["podman logs --tail N n","Last N lines"],["podman stats --no-stream","One-shot stats"],["podman top n","Process list"],["podman port n","Port mappings"],["podman cp n:/src ./dst","Copy from container"],["podman cp ./src n:/dst","Copy into container"],["podman inspect n","Full JSON config"],["podman events","Stream events"]]},
    {t:"Networks",c:"var(--c)",rows:[["podman network create net","Create bridge network"],["podman network create --subnet x","Custom subnet"],["podman network ls","List networks"],["podman network inspect net","Inspect (see containers)"],["podman network connect n c","Connect container"],["podman network disconnect n c","Disconnect"],["podman network rm net","Delete network"],["podman network prune","Remove unused"]]},
    {t:"Volumes",c:"var(--y)",rows:[["podman volume create vol","Create named volume"],["podman volume ls","List all volumes"],["podman volume inspect vol","Full metadata"],["podman volume export -o f vol","Backup to tar"],["podman volume import vol f","Restore from tar"],["podman volume rm vol","Delete"],["podman volume prune","Remove all unused"]]},
    {t:"Pods",c:"var(--o)",rows:[["podman pod create --name p","Create pod"],["podman pod create -p 8080:80","Create with ports"],["podman run -d --pod p img","Add container to pod"],["podman pod ls","List pods"],["podman pod inspect p","Full pod metadata"],["podman pod stop/start p","Lifecycle control"],["podman pod stats p","Resource usage"],["podman pod rm -f p","Remove (+ all ctrs)"],["podman generate kube p","Export K8s YAML"],["podman play kube f.yaml","Run from K8s YAML"],["podman play kube --down f","Tear down K8s YAML"]]},
    {t:"Rootless & Security",c:"var(--r)",rows:[["podman unshare id","Check user namespace UID"],["podman unshare chown","Fix file ownership"],["--userns=keep-id","Map host UID 1:1"],["--cap-drop ALL","Drop all capabilities"],["--cap-add NET_BIND_SERVICE","Add specific cap"],["--security-opt no-new-privs","Block privilege escalation"],["--read-only","Read-only root filesystem"],["--tmpfs /tmp","In-memory tmpfs"],["--security-opt seccomp=f","Custom seccomp profile"],["-v ./d:/d:Z","SELinux private relabel"],["-v ./d:/d:z","SELinux shared relabel"],["loginctl enable-linger","Start on boot w/o login"]]},
    {t:"System",c:"var(--t2)",rows:[["podman version","Show versions"],["podman info","Full system info"],["podman system info","Alias for info"],["podman system df","Disk usage"],["podman system prune","Prune stopped + nets"],["podman system prune -a","Prune everything unused"],["podman login reg","Authenticate"],["podman logout reg","Clear credentials"],["alias docker=podman","Drop-in replacement"]]},
  ];
  return(
    <div style={{padding:12,overflowY:"auto",height:"100%"}} className="au">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {secs.map(s=>(
          <div key={s.t} style={{background:"var(--s1)",border:"1px solid var(--b0)",borderRadius:6,overflow:"hidden"}}>
            <div style={{padding:"7px 12px",background:"var(--s2)",borderBottom:"1px solid var(--b0)",fontFamily:"var(--head)",fontSize:11,fontWeight:700,color:s.c,textTransform:"uppercase",letterSpacing:1.5}}>{s.t}</div>
            {s.rows.map(([cmd,desc],i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"5px 10px",borderBottom:"1px solid rgba(30,39,54,.4)",transition:"background .1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontFamily:"var(--mono)",fontSize:10.5,color:s.c}}>{cmd}</span>
                <span style={{fontFamily:"var(--mono)",fontSize:10.5,color:"var(--t3)"}}>{desc}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CONCEPTS
───────────────────────────────────────────────────────────── */
const CONCEPTS={
  overview:{title:"What is Podman?",render:()=>(
    <div style={{padding:20}} className="au">
      <p style={{fontFamily:"var(--sans)",fontSize:13.5,color:"var(--t2)",lineHeight:1.8,marginBottom:16}}>
        Podman is a <strong style={{color:"var(--c)"}}>daemonless, rootless-capable OCI container runtime</strong> developed by Red Hat.
        It replaces Docker without requiring a background service running as root — each container is a direct child process of your shell.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["🚫 No Daemon","Each container is a direct child process. No dockerd. No unix socket attack surface. No single point of failure.","var(--c)"],
          ["👤 Rootless","Runs as any unprivileged user via Linux user namespaces. Container root ≠ host root.","var(--g)"],
          ["🔄 Docker-Compatible","alias docker=podman works. Same OCI format, same CLI flags, same compose files, same registries.","var(--p)"],
          ["🫛 Native Pods","Kubernetes-style pods natively. Export running pods to K8s YAML with one command.","var(--o)"]].map(([t,d,c])=>(
          <div key={t} style={{background:"var(--s2)",borderTop:`2px solid ${c}`,borderRadius:6,padding:"13px 15px"}}>
            <div style={{fontFamily:"var(--head)",fontSize:13,fontWeight:700,marginBottom:5}}>{t}</div>
            <div style={{fontFamily:"var(--sans)",fontSize:12,color:"var(--t2)"}}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#05080d",border:"1px solid var(--b0)",borderRadius:7,padding:"14px 16px",fontFamily:"var(--mono)",fontSize:12.5,lineHeight:2}}>
        <div style={{color:"var(--t3)",marginBottom:4}}># Docker needs root daemon</div>
        <div style={{color:"var(--r)"}}>$ sudo systemctl start docker</div>
        <div style={{color:"var(--r)"}}>$ sudo docker run nginx</div>
        <div style={{height:12}}/>
        <div style={{color:"var(--t3)",marginBottom:4}}># Podman — just run it</div>
        <div><span style={{color:"var(--g)"}}>$</span> <span style={{color:"var(--c)"}}>podman run</span> -d --name web nginx:alpine</div>
        <div><span style={{color:"var(--g)"}}>$</span> alias docker=podman  <span style={{color:"var(--t3)"}}># zero script changes</span></div>
      </div>
    </div>
  )},
  rootless:{title:"Rootless Deep Dive",render:()=>(
    <div style={{padding:20}} className="au">
      <p style={{fontFamily:"var(--sans)",fontSize:13.5,color:"var(--t2)",lineHeight:1.8,marginBottom:16}}>
        Linux user namespaces give the container a private UID space. The container sees UID 0 (root), but the kernel maps that to your unprivileged host UID via <code style={{background:"var(--ca)",color:"var(--c)",padding:"1px 5px",borderRadius:3}}>/etc/subuid</code>.
      </p>
      <div style={{background:"var(--s2)",border:"1px solid var(--b0)",borderRadius:7,overflow:"hidden",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 40px 1fr"}}>
          <div style={{padding:"13px 15px"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--y)",textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>Inside Container</div>
            {[["UID","0 (root)","var(--r)"],["GID","0 (root)","var(--r)"],["whoami","root","var(--r)"],["write /etc","yes ✓","var(--g)"],["bind port <1024","yes ✓","var(--g)"]].map(([k,v,c])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:11.5}}>
                <span style={{color:"var(--t3)"}}>{k}</span><span style={{color:c,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",background:"var(--s1)",color:"var(--t3)",fontFamily:"var(--mono)",fontSize:14}}>→</div>
          <div style={{padding:"13px 15px"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--o)",textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>On Host</div>
            {[["UID","1001 (max)","var(--g)"],["GID","1001 (max)","var(--g)"],["whoami","max","var(--g)"],["write /etc","no ✗","var(--r)"],["bind port <1024","no ✗","var(--r)"]].map(([k,v,c])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:11.5}}>
                <span style={{color:"var(--t3)"}}>{k}</span><span style={{color:c,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{padding:"8px 14px",background:"rgba(52,208,88,.05)",borderTop:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:11,color:"var(--g)"}}>
          ★ Container escape = unprivileged user on host. Root inside = nobody outside.
        </div>
      </div>
      <div style={{background:"#05080d",border:"1px solid var(--b0)",borderRadius:7,padding:"13px 15px",fontFamily:"var(--mono)",fontSize:12,lineHeight:1.9,marginBottom:12}}>
        <div style={{color:"var(--t3)"}}># Check your subuid mapping</div>
        <div><span style={{color:"var(--g)"}}>$</span> cat /etc/subuid</div>
        <div style={{color:"var(--y)"}}>  max:100000:65536</div>
        <div style={{height:8}}/>
        <div style={{color:"var(--t3)"}}># Container UID 0 → host UID 100000</div>
        <div><span style={{color:"var(--g)"}}>$</span> podman run --rm alpine cat /proc/self/uid_map</div>
        <div style={{color:"var(--y)"}}>         0     100000      65536</div>
      </div>
      {[["⚠️ SELinux on RHEL/CentOS","Always add :Z to bind mounts (-v ./d:/d:Z). Without it, SELinux silently denies container access — no error message.","var(--r)"],
        ["⚠️ Ports <1024","Rootless can't bind privileged ports. Use -p 8080:80 and proxy at host level, or: sysctl -w net.ipv4.ip_unprivileged_port_start=80","var(--y)"],
        ["💡 --userns=keep-id","For dev bind mounts: maps your UID 1:1 into container so files appear owned by you on the host, not by subuid 100000.","var(--c)"]].map(([t,d,c])=>(
        <div key={t} style={{padding:"10px 14px",background:c+"10",border:`1px solid ${c}30`,borderRadius:5,fontFamily:"var(--sans)",fontSize:12.5,color:"var(--t2)",lineHeight:1.65,marginBottom:8}}>
          <strong style={{color:c}}>{t}:</strong> {d}
        </div>
      ))}
    </div>
  )},
  arch:{title:"Architecture",render:()=>(
    <div style={{padding:20}} className="au">
      <p style={{fontFamily:"var(--sans)",fontSize:13.5,color:"var(--t2)",lineHeight:1.8,marginBottom:16}}>
        Docker uses a central root daemon as an intermediary for everything. Podman forks processes directly — no daemon, no single point of failure.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {[{label:"Docker",color:"var(--r)",bg:"rgba(248,113,113,.06)",stack:[["docker CLI","CLI"],["REST API","transport"],["dockerd (root!)","⚠ root daemon"],["containerd","container mgr"],["runc","OCI runtime"],["container process","result"]],note:"⚠ Root daemon SPOF • Large attack surface via /var/run/docker.sock"},
          {label:"Podman",color:"var(--c)",bg:"rgba(77,166,255,.06)",stack:[["podman CLI","CLI"],["fork/exec","direct, no API"],["conmon (monitor)","output relay"],["crun (OCI runtime)","OCI runtime"],["container process","result"]],note:"✓ Daemonless • Each container is a direct child process • Rootless OK"}].map(({label,color,bg,stack,note})=>(
          <div key={label} style={{background:"#05080d",border:`1px solid ${color}30`,borderRadius:7,overflow:"hidden"}}>
            <div style={{padding:"7px 14px",background:color+"18",borderBottom:`1px solid ${color}25`,fontFamily:"var(--head)",fontSize:12,fontWeight:700,color}}>{label}</div>
            <div style={{padding:"16px",display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
              {stack.map(([s,role],i)=>(
                <div key={i} style={{textAlign:"center",width:"100%"}}>
                  <div style={{fontFamily:"var(--mono)",fontSize:11.5,color:s.includes("root")||s.includes("⚠")?"var(--r)":s.includes("process")?"var(--y)":"var(--t2)",background:s.includes("root")||s.includes("⚠")?"rgba(248,113,113,.08)":"transparent",borderRadius:3,padding:"4px 8px",marginBottom:2}}>{s}</div>
                  {i<stack.length-1&&<div style={{color:"var(--t3)",fontFamily:"var(--mono)",fontSize:11,marginBottom:2}}>↓</div>}
                </div>
              ))}
            </div>
            <div style={{padding:"7px 12px",background:color+"08",borderTop:`1px solid ${color}25`,fontFamily:"var(--mono)",fontSize:10,color,lineHeight:1.5}}>{note}</div>
          </div>
        ))}
      </div>
      <div style={{background:"var(--s2)",border:"1px solid var(--b0)",borderRadius:6,padding:"13px 15px",fontFamily:"var(--sans)",fontSize:13,color:"var(--t2)",lineHeight:1.7}}>
        <strong style={{color:"var(--c)"}}>conmon</strong> (Container Monitor) is a small C binary that stays alive as the container's adopted parent after <code style={{background:"var(--ca)",color:"var(--c)",padding:"1px 5px",borderRadius:3}}>podman run</code> exits. It relays I/O, collects the exit code, and notifies Podman — this is what makes <code style={{background:"var(--ca)",color:"var(--c)",padding:"1px 5px",borderRadius:3}}>podman logs</code> work even after the CLI process exits.
      </div>
    </div>
  )},
};

/* ─────────────────────────────────────────────────────────────
   APP
───────────────────────────────────────────────────────────── */
export default function App(){
  const[tab,setTab]=useState("terminal");
  const[labId,setLabId]=useState("L1");
  const[es,setEs]=useState(mkState());
  const[lines,setLines]=useState([
    {t:"",k:"out"},
    {t:"  ██████╗  ██████╗ ██████╗ ███╗   ███╗ █████╗ ███╗   ██╗",k:"info"},
    {t:"  ██╔══██╗██╔═══██╗██╔══██╗████╗ ████║██╔══██╗████╗  ██║",k:"info"},
    {t:"  ██████╔╝██║   ██║██║  ██║██╔████╔██║███████║██╔██╗ ██║",k:"info"},
    {t:"  ██╔═══╝ ██║   ██║██║  ██║██║╚██╔╝██║██╔══██║██║╚██╗██║",k:"info"},
    {t:"  ██║     ╚██████╔╝██████╔╝██║ ╚═╝ ██║██║  ██║██║ ╚████║",k:"info"},
    {t:"  ╚═╝      ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝",k:"info"},
    {t:"",k:"out"},
    {t:"  Mastery Lab  ·  v4.9.3  ·  rootless mode  ·  OCI compliant",k:"dim"},
    {t:"",k:"out"},
    {t:"  Quick start:",k:"sec"},
    {t:"    podman run -d --name web -p 8080:80 nginx:alpine",k:"ok"},
    {t:"    podman ps",k:"ok"},
    {t:"    podman logs web",k:"ok"},
    {t:"",k:"out"},
    {t:"  Type 'help' for all commands  ·  Tab autocomplete  ·  ↑↓ history",k:"dim"},
    {t:"",k:"out"},
  ]);
  const[history,setHistory]=useState([]);
  const histRef=useRef([]);
  const[completed,setCompleted]=useState({});
  const[xp,setXp]=useState(0);
  const[notif,setNotif]=useState(null);
  const[conceptKey,setConceptKey]=useState("overview");
  const[afKey,setAfKey]=useState(0);

  const showNotif=useCallback((msg,c="var(--g)")=>{setNotif({msg,c});setTimeout(()=>setNotif(null),3200);},[]);

  const handleCmd=useCallback((raw)=>{
    if(!raw.trim())return;
    histRef.current=[raw,...histRef.current].slice(0,150);
    setHistory(p=>[raw,...p].slice(0,400));
    const{state:ns,out}=engine(raw,es);
    if(out.some(o=>o.k==="clear")){setLines([{t:"Terminal cleared.",k:"dim"},{t:"",k:"out"}]);setEs(ns);return;}
    setEs(ns);
    setLines(p=>[...p,{t:`max@lab:~$ ${raw}`,k:"prompt"},...out,{t:"",k:"out"}]);
  },[es]);

  const handleLabComplete=useCallback((id,earnedXp)=>{
    if(completed[id])return;
    setCompleted(p=>({...p,[id]:true}));
    setXp(p=>p+earnedXp);
    showNotif(`🏆 ${LABS.find(l=>l.id===id)?.title} complete! +${earnedXp} XP`,"var(--g)");
  },[completed,showNotif]);

  const activeLab=LABS.find(l=>l.id===labId);
  const lvl=Math.floor(xp/200)+1;
  const xpInLvl=xp%200;
  const done=Object.keys(completed).length;
  const totalXp=LABS.reduce((a,l)=>a+l.xp,0);

  const NAVS=[
    {id:"terminal",label:"Terminal",icon:"⌨"},
    {id:"labs",label:"Labs",icon:"🧪",badge:`${done}/${LABS.length}`},
    {id:"dashboard",label:"Dashboard",icon:"📊"},
    {id:"concepts",label:"Concepts",icon:"📖"},
    {id:"cheatsheet",label:"Cheatsheet",icon:"📋"},
  ];
  const CONCEPT_ITEMS=[{id:"overview",label:"What is Podman?"},{id:"rootless",label:"Rootless Deep Dive"},{id:"arch",label:"Architecture"}];

  const labSuggestions=activeLab
    ?(activeLab.sections[0].examples||[]).filter(e=>!e.startsWith("#")).slice(0,3).concat(["podman ps","podman ps -a","help"])
    :["podman ps","help"];

  return(
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",height:"100vh",overflow:"hidden"}}>

        {/* ── SIDEBAR ── */}
        <aside style={{width:216,background:"var(--s1)",borderRight:"1px solid var(--b0)",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
          {/* brand */}
          <div style={{padding:"16px 14px 12px",borderBottom:"1px solid var(--b0)"}}>
            <div style={{fontFamily:"var(--mono)",fontSize:8,color:"var(--c)",letterSpacing:3,textTransform:"uppercase",marginBottom:3}}>⬡ Podman Lab</div>
            <div style={{fontFamily:"var(--head)",fontSize:22,fontWeight:900,letterSpacing:-0.5,lineHeight:1.1,color:"var(--t1)"}}>MASTERY</div>
            <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",marginTop:3}}>rootless · daemonless · v4.9</div>
          </div>
          {/* XP */}
          <div style={{padding:"9px 13px",borderBottom:"1px solid var(--b0)",background:"rgba(77,166,255,.03)"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--c)"}}>LVL {lvl}</span>
              <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)"}}>{xp}/{totalXp} XP</span>
            </div>
            <div style={{height:3,background:"var(--b0)",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",background:"linear-gradient(90deg,var(--p),var(--c))",width:`${(xpInLvl/200)*100}%`,transition:"width .5s ease"}}/>
            </div>
            <div style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",marginTop:3}}>{200-xpInLvl} XP to next level</div>
          </div>
          {/* nav */}
          <nav style={{flex:1,overflowY:"auto",paddingTop:4}}>
            {NAVS.map(item=>(
              <div key={item.id}>
                <div onClick={()=>{setTab(item.id);if(item.id==="terminal")setAfKey(k=>k+1);}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",cursor:"pointer",fontFamily:"var(--sans)",fontSize:12.5,fontWeight:500,
                    color:tab===item.id?"var(--c)":"var(--t2)",
                    background:tab===item.id?"rgba(77,166,255,.07)":"transparent",
                    borderLeft:`2px solid ${tab===item.id?"var(--c)":"transparent"}`,
                    transition:"all .12s"}}
                  onMouseEnter={e=>{if(tab!==item.id)e.currentTarget.style.background="var(--s2)";}}
                  onMouseLeave={e=>{if(tab!==item.id)e.currentTarget.style.background="transparent";}}>
                  <span style={{fontSize:13,width:16,textAlign:"center",flexShrink:0}}>{item.icon}</span>
                  {item.label}
                  {item.badge&&<span style={{marginLeft:"auto",fontFamily:"var(--mono)",fontSize:8,background:"rgba(77,166,255,.12)",color:"var(--c)",padding:"1px 5px",borderRadius:2}}>{item.badge}</span>}
                </div>
                {tab==="labs"&&item.id==="labs"&&(
                  <div style={{borderTop:"1px solid var(--b0)",paddingTop:2,paddingBottom:4}}>
                    {LABS.map(l=>(
                      <div key={l.id} onClick={()=>setLabId(l.id)}
                        style={{padding:"5px 12px 5px 36px",cursor:"pointer",fontFamily:"var(--sans)",fontSize:11,
                          color:labId===l.id?l.color:"var(--t3)",
                          background:labId===l.id?"rgba(77,166,255,.04)":"transparent",
                          display:"flex",alignItems:"center",gap:5,transition:"all .1s"}}
                        onMouseEnter={e=>{if(labId!==l.id)e.currentTarget.style.color="var(--t2)";}}
                        onMouseLeave={e=>{if(labId!==l.id)e.currentTarget.style.color="var(--t3)";}}>
                        <span style={{fontSize:10}}>{l.icon}</span>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{l.title}</span>
                        {completed[l.id]&&<span style={{color:"var(--g)",fontSize:10,flexShrink:0}}>✓</span>}
                      </div>
                    ))}
                  </div>
                )}
                {tab==="concepts"&&item.id==="concepts"&&(
                  <div style={{borderTop:"1px solid var(--b0)",paddingTop:2,paddingBottom:4}}>
                    {CONCEPT_ITEMS.map(c=>(
                      <div key={c.id} onClick={()=>setConceptKey(c.id)}
                        style={{padding:"5px 12px 5px 36px",cursor:"pointer",fontFamily:"var(--sans)",fontSize:11,
                          color:conceptKey===c.id?"var(--c)":"var(--t3)",
                          background:conceptKey===c.id?"rgba(77,166,255,.04)":"transparent",transition:"all .1s"}}
                        onMouseEnter={e=>{if(conceptKey!==c.id)e.currentTarget.style.color="var(--t2)";}}
                        onMouseLeave={e=>{if(conceptKey!==c.id)e.currentTarget.style.color="var(--t3)";}}>
                        {c.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          {/* status footer */}
          <div style={{padding:"8px 13px",borderTop:"1px solid var(--b0)",fontFamily:"var(--mono)",fontSize:9,lineHeight:1.7}}>
            <div><span style={{color:"var(--g)"}}>●</span> rootless mode</div>
            <div><span style={{color:"var(--c)"}}>●</span> {Object.values(es.containers).filter(c=>c.status.startsWith("Up")).length} containers running</div>
            <div style={{color:"var(--t3)"}}>{Object.keys(es.containers).length} ctrs · {Object.keys(es.images).length} imgs · {Object.keys(es.networks).length} nets</div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* top bar */}
          <div style={{background:"var(--s1)",borderBottom:"1px solid var(--b0)",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <span style={{fontFamily:"var(--head)",fontSize:13,fontWeight:700,color:"var(--t2)",textTransform:"uppercase",letterSpacing:.5}}>
              {tab==="terminal"?"Interactive Terminal":tab==="labs"?activeLab?.title||"Labs":tab==="dashboard"?"Live Dashboard":tab==="concepts"?(CONCEPTS[conceptKey]?.title||"Concepts"):"Cheatsheet"}
            </span>
            <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
              {done>0&&<span style={{fontFamily:"var(--mono)",fontSize:9,padding:"2px 8px",background:"rgba(240,180,41,.1)",color:"var(--y)",borderRadius:3,border:"1px solid rgba(240,180,41,.22)"}}>🏆 {xp}XP · Lvl {lvl}</span>}
              <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)"}}>{Object.keys(es.containers).length}c · {Object.keys(es.images).length}i · {Object.keys(es.networks).length}n · {Object.keys(es.volumes).length}v</span>
            </div>
          </div>

          {/* content area */}
          <div style={{flex:1,overflow:"hidden",display:"flex"}}>
            {tab==="terminal"&&(
              <div style={{flex:1,padding:12}}>
                <Terminal lines={lines} onCmd={handleCmd} histRef={histRef} autoFocusKey={afKey}
                  suggestions={["podman ps","podman images","podman run -d --name web nginx:alpine","podman system df","podman network ls","podman volume ls","podman pod ls","help","clear"]}/>
              </div>
            )}
            {tab==="labs"&&(
              <div style={{flex:1,display:"flex",overflow:"hidden"}}>
                <div style={{width:390,borderRight:"1px solid var(--b0)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
                  {activeLab&&<LabView lab={activeLab} history={history} es={es} onComplete={handleLabComplete}/>}
                </div>
                <div style={{flex:1,padding:10}}>
                  <Terminal lines={lines} onCmd={handleCmd} histRef={histRef} suggestions={labSuggestions}/>
                </div>
              </div>
            )}
            {tab==="dashboard"&&<Dashboard es={es}/>}
            {tab==="concepts"&&(
              <div style={{flex:1,overflowY:"auto"}}>
                {CONCEPTS[conceptKey]?.render()}
              </div>
            )}
            {tab==="cheatsheet"&&<Cheatsheet/>}
          </div>
        </main>
      </div>

      {/* notification toast */}
      {notif&&(
        <div style={{position:"fixed",bottom:20,right:20,padding:"11px 18px",background:"var(--s2)",border:`1px solid ${notif.c}`,borderRadius:7,
          fontFamily:"var(--head)",fontSize:14,fontWeight:700,color:notif.c,
          boxShadow:`0 4px 24px rgba(0,0,0,.7), 0 0 0 1px ${notif.c}30`,
          animation:"slideLeft .3s ease",zIndex:9999}}>
          {notif.msg}
        </div>
      )}
    </>
  );
}
