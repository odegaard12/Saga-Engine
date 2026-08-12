import{r as S,L as Q,j as n,R as Ze,l as ps,i as ms,b as gs,g as fs,W as hs,a as bs,c as xs,d as ys,e as tn,f as nn,h as _s,t as vs,I as js,k as ws,m as ks,n as Ss}from"./index-BJBulNgO.js";async function qa(e,t){const a=await fetch(e,{method:"POST",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(t)});if(!a.ok)throw new Error(`Request failed: HTTP ${a.status}`);return a.json()}function Cs(e){return qa("/api/admin/login",{password:e})}function ln(e){return qa("/api/admin/react-overview",{})}function Ns(e){return qa("/api/admin/export",{})}async function qr(e,t){const a=await fetch(e,{method:"POST",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(t)});let i=null;try{i=await a.json()}catch{i=null}if(!a.ok){const r=i&&typeof i=="object"&&"message"in i?String(i.message):`HTTP ${a.status}`;throw new Error(r)}return i}async function Es(e){const t=await fetch(e,{method:"GET",credentials:"same-origin",headers:{Accept:"application/json"}});let a=null;try{a=await t.json()}catch{a=null}if(!t.ok){const i=a&&typeof a=="object"&&"message"in a?String(a.message):`HTTP ${t.status}`;throw new Error(i)}return a}function ia(e,t={}){return[{...t}]}function Rs(e){return["/api/admin/stages"]}function Xi(e){if(Array.isArray(e))return{status:"ok",stages:e};if(!e||typeof e!="object")return{status:"fail",message:"Empty response from admin stages endpoint."};const t=e,a=typeof t.status=="string"?t.status:"ok",i=typeof t.message=="string"?t.message:void 0,r=Array.isArray(t.stages)?t.stages:Array.isArray(t.data)?t.data:Array.isArray(t.items)?t.items:Array.isArray(t.nodes)?t.nodes:void 0;return a==="fail"?{status:"fail",message:i||"Admin stages endpoint returned fail."}:r?{status:"ok",stages:r}:{status:"fail",message:i||"Admin stages response did not include stages."}}function Ms(e){if(!e||typeof e!="object")return{status:"fail",message:"Admin save returned an empty response."};const t=e,a=typeof t.status=="string"?t.status.toLowerCase():"",i=typeof t.message=="string"?t.message:typeof t.detail=="string"?t.detail:void 0;return a!=="ok"&&a!=="success"?{status:"fail",message:i||`Admin save returned status ${a||"missing"}.`}:{status:"ok",message:i}}async function eo(e){const t=[];for(const a of ia())try{const i=await qr("/api/admin/stages",a),r=Xi(i);if(r.status==="ok")return r;t.push(r.message||"Unknown stages POST response error.")}catch(i){t.push(i instanceof Error?i.message:"Unknown stages POST request error.")}for(const a of Rs())try{const i=await Es(a),r=Xi(i);if(r.status==="ok")return r;t.push(r.message||"Unknown stages GET response error.")}catch(i){t.push(i instanceof Error?i.message:"Unknown stages GET request error.")}return{status:"fail",message:t.filter(Boolean).join(" | ")||"Could not load raw admin stages."}}async function zs(e,t){const a=[],i=[...ia(e,{stages:t}),...ia(e,{data:t}),...ia(e,{nodes:t})];for(const r of i)try{const o=await qr("/api/admin/save",r),l=Ms(o);if(l.status==="ok")return l;a.push(l.message||"Unknown save response error.")}catch(o){a.push(o instanceof Error?o.message:"Unknown save request error.")}return{status:"fail",message:a.filter(Boolean).join(" | ")||"Could not save admin stages."}}function qs(e){if(!e||typeof e!="object")return{status:"fail",message:"Admin config save returned an empty response."};const t=e,a=typeof t.status=="string"?t.status.toLowerCase():"",i=typeof t.message=="string"?t.message:typeof t.detail=="string"?t.detail:void 0;return a!=="ok"&&a!=="success"?{status:"fail",message:i||`Admin config save returned status ${a||"missing"}.`}:{status:"ok",message:i}}function As(e,t){return[{config:t},{data:t},{...t}]}async function to(e,t){const a=[];for(const i of As(e,t))try{const r=await fetch("/api/admin/save-config",{method:"POST",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(i)});let o=null;try{o=await r.json()}catch{o=null}if(!r.ok){const d=o&&typeof o=="object"&&"message"in o?String(o.message):`HTTP ${r.status}`;a.push(d);continue}const l=qs(o);if(l.status==="ok")return l;a.push(l.message||"Unknown config save response error.")}catch(r){a.push(r instanceof Error?r.message:"Unknown config save request error.")}return{status:"fail",message:a.filter(Boolean).join(" | ")||"Could not save admin config."}}function Ps(e,t){return qa("/api/admin/profile-action",{profile_id:e,action:t})}const Is={collectible:{kind:"collectible",icon:"⭐",label:"Coleccionable",shortLabel:"Coleccionable",tone:"collectible"},qr:{kind:"qr",icon:"▦",label:"Objeto QR",shortLabel:"Objeto QR",tone:"collectible"},requirement:{kind:"requirement",icon:"🔑",label:"Llave QR",shortLabel:"Llave",tone:"requirement"},clue:{kind:"clue",icon:"🧩",label:"Pista QR",shortLabel:"Pista",tone:"clue"},bonus:{kind:"bonus",icon:"🎁",label:"Bonus QR",shortLabel:"Bonus",tone:"bonus"}};function Oa(e){return e==="collectible"||e==="requirement"||e==="clue"||e==="bonus"||e==="qr"?e:null}function Ls(e){if(!e||typeof e!="object")return null;const t=e,i=!!((t.config&&typeof t.config=="object"?t.config:{}).is_map_collectible||t.is_map_collectible),r=!!(t.physical_qr||t.qr_payload),o=Oa(t.physical_node_kind||t.physical_item_kind);if(r&&!i){if(o==="requirement"||o==="clue"||o==="bonus")return o;const d=t.physical_qr;if(d&&typeof d=="object"){const s=Oa(d.kind);if(s==="requirement"||s==="clue"||s==="bonus")return s}return"qr"}if(o)return o;const l=t.physical_qr;if(l&&typeof l=="object"){const d=Oa(l.kind);if(d)return d}return null}function Aa(e){const t=Ls(e);if(!t)return null;const a=e,i=a.physical_icon||a.icon||a.config&&typeof a.config=="object"&&a.config.physical_icon,r=Is[t];return i?{...r,icon:String(i)}:r}function $s(e){const t=Aa(e);if(!t)return"";const a=e;return a.config&&typeof a.config=="object"&&a.config.is_map_collectible?`${t.icon} Coleccionable`:`${t.icon} ${t.shortLabel}`}async function no(e){if(e.length<2)return null;const a=Math.max(1,Math.ceil(e.length/100)),i=e.filter((d,s)=>s%a===0),r=e[e.length-1];i[i.length-1]!==r&&i.push(r);const o=i.map(([d])=>d.toFixed(5)).join(","),l=i.map(([,d])=>d.toFixed(5)).join(",");try{const d=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${o}&longitude=${l}`);if(!d.ok)return null;const s=await d.json(),c=s==null?void 0:s.elevation;if(!Array.isArray(c)||c.length<2)return null;let u=0;for(let p=1;p<c.length;p++){const m=Number(c[p])-Number(c[p-1]);Number.isFinite(m)&&m>0&&(u+=m)}return Math.round(u)}catch{return null}}function Ar(e){if(!Array.isArray(e))return[];const t=[];for(const a of e)if(Array.isArray(a)&&a.length>=2){const i=Number(a[0]),r=Number(a[1]);Number.isFinite(i)&&Number.isFinite(r)&&t.push([i,r])}return t}function ao(e){return Ar(e.route_via)}function io(e){return Ar(e.route_track)}function ha(e,t){const i=(t[0]-e[0])*Math.PI/180,r=(t[1]-e[1])*Math.PI/180,o=Math.sin(i/2)**2+Math.cos(e[0]*Math.PI/180)*Math.cos(t[0]*Math.PI/180)*Math.sin(r/2)**2;return 6371*2*Math.atan2(Math.sqrt(o),Math.sqrt(1-o))}function ci(e,t){if(e.length<2)return[...e,t];let a=1,i=1/0;for(let o=0;o<e.length-1;o++){const l=ha(e[o],t)+ha(t,e[o+1]);l<i&&(i=l,a=o+1)}const r=[...e];return r.splice(a,0,t),r}async function Ts(e,t){var p,m,y;if(e.length<2)return ci(e,t);let a=0,i=1/0;e.forEach((b,w)=>{const f=ha(b,t);f<i&&(i=f,a=w)});const r=Math.max(2,Math.round(e.length*.12)),o=Math.max(0,a-r),l=Math.min(e.length-1,a+r),d=e[o],s=e[l],u=`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${`${d[1]},${d[0]};${t[1]},${t[0]};${s[1]},${s[0]}`}?overview=full&geometries=geojson`;try{const w=await(await fetch(u)).json(),f=(y=(m=(p=w==null?void 0:w.routes)==null?void 0:p[0])==null?void 0:m.geometry)==null?void 0:y.coordinates;if(Array.isArray(f)&&f.length>=2){const v=f.filter(N=>Array.isArray(N)&&N.length>=2).map(([N,h])=>[h,N]);return[...e.slice(0,o),...v,...e.slice(l+1)]}}catch{}return ci(e,t)}function oo(e){let t=0;for(let a=0;a<e.length-1;a++)t+=ha(e[a],e[a+1]);return t}function Pr(e){return typeof e.lat=="number"&&typeof e.lon=="number"}function ft(e){return Pr(e)?[e.lat,e.lon]:null}function Fs(e){const t=typeof e.radius=="number"?e.radius:50;return t>0?t:50}function Ri(e){const t=e,a=t.config&&typeof t.config=="object"?t.config:{},i=String(a.game_id||t.game_type||"");return t.physical_qr||t.qr_payload?"Objeto QR":a.is_map_collectible||t.is_map_collectible||t.physical_node_kind==="collectible"||t.physical_item_kind==="collectible"?"Coleccionable":i==="simple_checkpoint"?"Checkpoint":i==="logic_circuit"?"Matriz de circuitos":i==="sequence_code"?"Simón Dice":i==="place_mosaic"?"Mosaico del lugar":i==="tilt_maze"?"Laberinto":e.type==="bearing_hunt"?"Bearing":e.type==="circuit_matrix"?"Circuit":e.type==="motion_challenge"?"Motion":e.type==="audio_challenge"?"Audio":"Checkpoint"}function Ds(e,t){const a=e.type==="bearing_hunt"?"#38bdf8":e.type==="circuit_matrix"?"#a78bfa":"#34d399";return{color:a,fillColor:t?"#ffffff":a,ringOpacity:t?.28:.14,ringWeight:t?4:2}}function Bt(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function Os(e,t,a,i){const r=Bt(e.title||"Untitled node"),o=Bt(Ri(e)),l=`${e.index+1}`,d=Aa(e),s=d?Bt(d.label):"",c=d?Bt(d.icon):"",u=d?Bt(d.tone):"";return`
    <div class="admin-node-pin-shell${t?" admin-node-pin-shell--selected":""}">
      <div
        class="admin-node-pin${t?" admin-node-pin--selected":""}"
        style="--node-color:${a};--node-fill:${i};"
        title="${r} · ${s||o}"
      >
        ${d?`<span class="admin-node-pin__physical admin-node-pin__physical--${u}" title="${s}">${c}</span>`:""}
        <span class="admin-node-pin__index">${l}</span>
        <span class="admin-node-pin__grip">⋮⋮</span>
      </div>
      <div class="admin-node-label${t?" admin-node-label--selected":""}">
        <strong>${l}. ${d?`<span class="admin-node-label__physical">${c}</span>`:""}${r}</strong>
        <span>${d?`${s} · ${o}`:o}</span>
      </div>
    </div>
  `}function Bs(e,t){const a=e.index+1,i=Bt(e.title||`Nodo ${a}`),r=Bt(Ri(e)),o=typeof e.radius=="number"?e.radius:25,l=Aa(e),d=l?`${l.icon} ${Bt(l.label)}`:"";return`
    <div class="admin-node-quick-popup" style="padding:10px 12px;min-width:230px;color:#f8fafc;font-family:system-ui,sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:900;background:rgba(56,189,248,0.22);color:#38bdf8;padding:3px 10px;border-radius:999px;border:1px solid rgba(56,189,248,0.45);letter-spacing:0.5px;">
          NODO #${a} DE ${t}
        </span>
        <span style="font-size:11px;color:#94a3b8;font-weight:800;background:rgba(15,23,42,0.6);padding:3px 8px;border-radius:6px;">📡 ${o}m</span>
      </div>
      <strong style="display:block;font-size:15px;font-weight:900;color:#fff;margin-bottom:6px;line-height:1.2;">${i}</strong>
      <div style="font-size:12px;color:#cbd5e1;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="background:rgba(255,255,255,0.08);padding:2px 8px;border-radius:6px;">🎮 ${r}</span>
        ${d?`<span style="color:#34d399;background:rgba(52,211,153,0.14);padding:2px 8px;border-radius:6px;font-weight:700;">${d}</span>`:""}
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
        <button type="button" class="admin-popup-edit-btn" style="flex:1;padding:8px 14px;border-radius:10px;border:1px solid rgba(56,189,248,0.6);background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 4px 14px rgba(14,165,233,0.35);">
          ✏️ Editar Nodo
        </button>
      </div>
    </div>
  `}function Gs({stages:e,selectedStage:t,onSelectStage:a,onCreateStageAt:i,onInsertStageAt:r,onMoveStage:o,onSetLegVia:l,onSetLegTrack:d,tileMode:s,freeShape:c,showHeatmap:u,onToggleHeatmap:p,onMetricsUpdate:m,playRouteTrigger:y}){const b=S.useRef(null),w=S.useRef(null),f=S.useRef([]),v=S.useRef([]),N=S.useRef([]),h=S.useRef([]),C=S.useRef(new Map),z=S.useRef(new Map),B=S.useRef(null),U=S.useRef(0),ee=S.useRef(!1),_e=S.useRef(null),pe=S.useRef(null),[ke,je]=S.useState(!1),[mt,Fe]=S.useState("idle"),[K,we]=S.useState(0),[qe,He]=S.useState(0),[Ue,de]=S.useState(0),De=u!==void 0?u:ke,Se=S.useMemo(()=>e.filter(Pr),[e]),Xe=S.useRef(null),Oe=S.useRef(null),te=S.useRef(null),[lt,Ye]=S.useState("satellite-osm"),Ke=s??lt,tt=!!c;S.useEffect(()=>{if(!b.current||w.current)return;const x=Q.map(b.current,{zoomControl:!1,attributionControl:!1,doubleClickZoom:!1});pe.current=Q.svg({padding:1}),x.on("click",ce=>{ee.current||Date.now()<U.current||i&&i(ce.latlng.lat,ce.latlng.lng,{x:ce.originalEvent.clientX,y:ce.originalEvent.clientY})});const A=Q.layerGroup().addTo(x);Xe.current=A;const T=Q.layerGroup().addTo(x);Oe.current=T,x.setView([40.4168,-3.7038],6),w.current=x;const Z=()=>de(ce=>ce+1);return x.on("zoomend",Z),()=>{_e.current&&window.clearTimeout(_e.current),x.off("zoomend",Z),f.current.forEach(ce=>ce.remove()),f.current=[],x.remove(),w.current=null}},[]);const gt=S.useRef(!1),[Et,me]=S.useState({distanceKm:0,durationMin:0,elevationM:0});S.useEffect(()=>{const x=Xe.current;if(x)if(x.clearLayers(),Ke==="satellite-osm"){const A=Q.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxNativeZoom:20,maxZoom:22,updateWhenIdle:!1,keepBuffer:4}),T=Q.tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png",{maxNativeZoom:19,maxZoom:22,opacity:.95,updateWhenIdle:!1,keepBuffer:4}),Z=Q.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",{maxNativeZoom:19,maxZoom:22,opacity:.9,updateWhenIdle:!1,keepBuffer:4}),ce=Q.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",{maxNativeZoom:20,maxZoom:22,opacity:.95,subdomains:"abcd",updateWhenIdle:!1,keepBuffer:4});x.addLayer(A),x.addLayer(T),x.addLayer(Z),x.addLayer(ce)}else if(Ke==="cyclosm"){const A=Q.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",{maxNativeZoom:19,maxZoom:22,subdomains:["a","b","c"],updateWhenIdle:!1,keepBuffer:4});x.addLayer(A)}else if(Ke==="osm"){const A=Q.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxNativeZoom:19,maxZoom:22,updateWhenIdle:!1,keepBuffer:4});x.addLayer(A)}else{const A=Q.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxNativeZoom:20,maxZoom:22,updateWhenIdle:!1,keepBuffer:4});x.addLayer(A)}},[Ke]);const g=S.useRef(new Set);return S.useEffect(()=>{const x=w.current,A=Oe.current;if(!x||!A)return;const T=[],Z=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];function ce($e){const P=Oe.current;P&&$e.forEach(W=>{if(W.type==="way"&&W.geometry&&!g.current.has(W.id)){g.current.add(W.id);const oe=W.geometry.map(ge=>[ge.lat,ge.lon]);Q.polyline(oe,{color:"#ffffff",weight:7,opacity:.35,lineCap:"round",lineJoin:"round",interactive:!1,noClip:!0}).addTo(P),Q.polyline(oe,{color:"#f59e0b",weight:4,opacity:.95,dashArray:"5 7",lineCap:"round",lineJoin:"round",interactive:!1,noClip:!0}).addTo(P)}})}async function Ce(){const $e=w.current;if(!$e||!Oe.current||$e.getZoom()<13)return;const P=$e.getBounds();if(T.some(be=>be.contains(P)))return;const W=P.pad(.25),oe=W.getSouth(),ge=W.getWest(),le=W.getNorth(),We=W.getEast();te.current&&te.current.abort();const H=new AbortController;te.current=H;const Re=`[out:json][timeout:25];(way["highway"](${oe},${ge},${le},${We}););out geom;`;for(const be of Z)try{const se=`${be}?data=${encodeURIComponent(Re)}`,X=await fetch(se,{signal:H.signal});if(!X.ok)continue;const Ae=await X.json();Ae&&Array.isArray(Ae.elements)&&(ce(Ae.elements),T.push(W));return}catch(se){if((se==null?void 0:se.name)==="AbortError")return}console.error("Overpass: ningún espejo respondió con los caminos.")}let Ne;function Be(){clearTimeout(Ne),Ne=window.setTimeout(()=>void Ce(),800)}return x.on("moveend",Be),setTimeout(()=>void Ce(),200),()=>{x.off("moveend",Be),clearTimeout(Ne)}},[w.current]),S.useEffect(()=>{const x=w.current;if(!x)return;f.current.forEach(P=>P.remove()),f.current=[];const A=v.current;v.current=[];const T=[...Se].sort((P,W)=>P.index-W.index),Z=[];if(T.forEach(P=>{const W=ft(P);W&&Z.push(W)}),Z.length>=2){const P=[],W=[];T.forEach((H,Re)=>{const be=ft(H);if(be){if(Re>0)for(const se of ao(H))P.push(se),W.push(Re-1);P.push(be),W.push(Re-1)}});let oe=0;for(let H=0;H<P.length-1;H++){const[Re,be]=P[H],[se,X]=P[H+1],Ae=6371,ne=(se-Re)*Math.PI/180,Me=(X-be)*Math.PI/180,ye=Math.sin(ne/2)**2+Math.cos(Re*Math.PI/180)*Math.cos(se*Math.PI/180)*Math.sin(Me/2)**2,ze=2*Math.atan2(Math.sqrt(ye),Math.sqrt(1-ye));oe+=Ae*ze}const ge=T.slice(1).map(H=>io(H)),le=ge.length>0&&ge.every(H=>H.length>=2),We=Math.round(oe*15);if(le||(me(H=>({...H,distanceKm:oe,durationMin:We})),m==null||m({distanceKm:oe,trailKm:oe,durationMin:We,mappedCount:Z.length,routeCoords:Z,measured:!1})),le){A.forEach(ne=>ne.remove());const H=ge.map(oo),Re=H.reduce((ne,Me)=>ne+Me,0);x._lastLegDistances=H;const be=[];ge.forEach(ne=>be.push(...ne)),h.current=be;const se=Math.round(Re*15);me(ne=>({...ne,distanceKm:Re,durationMin:se})),m==null||m({distanceKm:Re,trailKm:Re,durationMin:se,mappedCount:Z.length,routeCoords:be,measured:!0}),ge.forEach((ne,Me)=>{const ye=T[Me],ze=T[Me+1],_=`🥾 Tramo ${Me+1}: ${(ye==null?void 0:ye.title)||"Nodo A"} ➡️ ${(ze==null?void 0:ze.title)||"Nodo B"} · ${H[Me].toFixed(2)} km (trazado real GPX)`,k=Q.polyline(ne,{color:"#047857",weight:11,opacity:.8,lineCap:"round",lineJoin:"round",noClip:!0,renderer:pe.current??void 0}).addTo(x),j=Q.polyline(ne,{color:"#10b981",weight:6,opacity:.95,lineCap:"round",lineJoin:"round",noClip:!0,renderer:pe.current??void 0}).addTo(x);if(j.bindTooltip(_,{sticky:!0,className:"saga-route-tooltip-red"}),j.on("mouseover",()=>{j.setStyle({color:"#ff0000",weight:9,opacity:1}),k.setStyle({color:"#991b1b",weight:14,opacity:.9})}),j.on("mouseout",()=>{j.setStyle({color:"#10b981",weight:6,opacity:.95}),k.setStyle({color:"#047857",weight:11,opacity:.8})}),ze&&d){let q=!1,$=null;const F=R=>{Q.DomEvent.stopPropagation(R.originalEvent),q=!0,ee.current=!0,x.dragging.disable();const E=L=>{if(!q)return;const I=[L.latlng.lat,L.latlng.lng],J=ci(ne,I);$?$.setLatLngs(J):$=Q.polyline(J,{color:"#ff0000",weight:8,opacity:.95,noClip:!0,renderer:pe.current??void 0}).addTo(x);const Y=oo(J),Qe=H.reduce((Ee,Je,et)=>et!==Me?Ee+Je:Ee,0);me(Ee=>({...Ee,distanceKm:Qe+Y})),m==null||m({distanceKm:Qe+Y,trailKm:Qe+Y,measured:!0})},O=L=>{x.off("mousemove",E),x.off("mouseup",O),x.dragging.enable(),q=!1,U.current=Date.now()+800,window.setTimeout(()=>{ee.current=!1},120),$&&(x.removeLayer($),$=null);const I=[L.latlng.lat,L.latlng.lng];Ts(ne,I).then(J=>{d(ze,J)})};x.on("mousemove",E),x.on("mouseup",O)};j.on("mousedown",F),k.on("mousedown",F)}tt&&ze&&d&&ne.forEach((q,$)=>{if($===0||$===ne.length-1)return;const F=Math.max(1,Math.ceil(ne.length/60));if($%F!==0)return;const R=B.current===`${Me}:${$}`,E=Q.circleMarker(q,{radius:R?9:7,color:R?"#ffffff":"#0f172a",weight:R?3:1.5,fillColor:R?"#ef4444":"#fbbf24",fillOpacity:1,className:"saga-shape-handle",bubblingMouseEvents:!1}).addTo(x);E.on("mousedown",O=>{Q.DomEvent.stopPropagation(O.originalEvent),ee.current=!0,x.dragging.disable(),B.current=`${Me}:${$}`,E.setStyle({radius:9,color:"#ffffff",weight:3,fillColor:"#ef4444"});const L=ne.map(Ee=>[...Ee]),I=ne.map(Ee=>[...Ee]),J=Math.max(2,Math.round(F*1.6)),Y=Ee=>{const Je=Ee.latlng.lat-I[$][0],et=Ee.latlng.lng-I[$][1];for(let xt=-J;xt<=J;xt++){const ot=$+xt;if(ot<=0||ot>=I.length-1)continue;const Rt=1-Math.abs(xt)/(J+1);L[ot]=[I[ot][0]+Je*Rt,I[ot][1]+et*Rt]}E.setLatLng(Ee.latlng),j.setLatLngs(L),k.setLatLngs(L)},Qe=()=>{x.off("mousemove",Y),x.off("mouseup",Qe),x.dragging.enable(),U.current=Date.now()+800,window.setTimeout(()=>{ee.current=!1},120),d(ze,L)};x.on("mousemove",Y),x.on("mouseup",Qe)}),v.current.push(E)}),v.current.push(k,j)});const X=`gpx|${be.length}`,Ae=z.current.get(X);typeof Ae=="number"?(me(ne=>({...ne,elevationM:Ae})),m==null||m({elevationM:Ae})):no(be).then(ne=>{ne!==null&&(z.current.set(X,ne),me(Me=>({...Me,elevationM:ne})),m==null||m({elevationM:ne}))})}if(!le){const H=P.map(([X,Ae])=>`${Ae},${X}`).join(";"),Re=`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${H}?overview=full&geometries=geojson&steps=true`,be=C.current.get(H);(be?Promise.resolve(be):fetch(Re).then(X=>X.json())).then(X=>{var Ae;if(X&&X.routes&&X.routes[0]&&X.routes[0].legs){if(C.current.set(H,X),C.current.size>60){const R=C.current.keys().next().value;R!==void 0&&C.current.delete(R)}A.forEach(R=>R.remove());const ne=X.routes[0],Me=ne.distance/1e3,ye=Math.round((ne.duration||Me*900)/60);me(R=>({...R,distanceKm:Me,durationMin:ye})),m==null||m({distanceKm:Me,trailKm:Me,durationMin:ye,mappedCount:Z.length,measured:!0});const ze=[];for(const R of ne.legs||[])for(const E of(R==null?void 0:R.steps)||[])for(const O of((Ae=E==null?void 0:E.geometry)==null?void 0:Ae.coordinates)||[]){const[L,I]=O||[];Number.isFinite(I)&&Number.isFinite(L)&&ze.push([I,L])}h.current=ze,ze.length>0&&(m==null||m({routeCoords:ze}));const _=`${H}|${ze.length}`,k=z.current.get(_);typeof k=="number"?(me(R=>({...R,elevationM:k})),m==null||m({elevationM:k})):no(ze).then(R=>{R!==null&&(z.current.set(_,R),me(E=>({...E,elevationM:R})),m==null||m({elevationM:R}))});const j=Math.max(0,T.length-1),q=Array.from({length:j},()=>[]),$=Array.from({length:j},()=>0);ne.legs.forEach((R,E)=>{var I;const O=W[E+1];if(O===void 0||O<0||O>=j)return;const L=(I=R.geometry)!=null&&I.coordinates?R.geometry.coordinates.map(([J,Y])=>[Y,J]):[];L.length===0&&R.steps&&R.steps.forEach(J=>{var Y;(Y=J.geometry)!=null&&Y.coordinates&&J.geometry.coordinates.forEach(([Qe,Ee])=>{L.push([Ee,Qe])})}),q[O].push(...L),$[O]+=(R.distance||0)/1e3});const F=$;x._lastLegDistances=F,q.forEach((R,E)=>{const O=T[E],L=T[E+1],I=O?ft(O):null,J=L?ft(L):null,Y=R.length>=2?R:I&&J?[I,J]:[];if(Y.length<2)return;const Qe=`🟢 Tramo ${E+1}: ${(O==null?void 0:O.title)||"Nodo A"} ➡️ ${(L==null?void 0:L.title)||"Nodo B"} (Pasa ratón para VER EN ROJO / Arrastra la línea para moldear camino)`,Ee=Q.polyline(Y,{color:"#047857",weight:11,opacity:.8,lineCap:"round",lineJoin:"round",noClip:!0,renderer:pe.current??void 0}).addTo(x),Je=Q.polyline(Y,{color:"#10b981",weight:6,opacity:.95,lineCap:"round",lineJoin:"round",noClip:!0,renderer:pe.current??void 0}).addTo(x);let et=null,xt=null;O&&Y.length>0&&(et=Q.polyline([[O.lat,O.lon],Y[0]],{color:"#10b981",weight:3,dashArray:"5, 8",opacity:.8,noClip:!0,renderer:pe.current??void 0}).addTo(x)),L&&Y.length>0&&(xt=Q.polyline([Y[Y.length-1],[L.lat,L.lon]],{color:"#10b981",weight:3,dashArray:"5, 8",opacity:.8,noClip:!0,renderer:pe.current??void 0}).addTo(x)),Je.bindTooltip(Qe,{sticky:!0,className:"saga-route-tooltip-red"}),Je.on("mouseover",()=>{Je.setStyle({color:"#ff0000",weight:9,opacity:1}),Ee.setStyle({color:"#991b1b",weight:14,opacity:.9})}),Je.on("mouseout",()=>{Je.setStyle({color:"#10b981",weight:6,opacity:.95}),Ee.setStyle({color:"#047857",weight:11,opacity:.8})});let ot=null,Rt=!1,gn=!1,Wn=0;const Qn=Qt=>{Q.DomEvent.stopPropagation(Qt.originalEvent),Q.DomEvent.preventDefault(Qt.originalEvent)},Vn=Qt=>{Q.DomEvent.stopPropagation(Qt.originalEvent),ee.current=!0,_e.current&&window.clearTimeout(_e.current),Rt=!0,gn=!1,x.dragging.disable(),Je.setStyle({color:"#ff0000",weight:9}),Ee.setStyle({color:"#991b1b",weight:14});const Vt=Y[0],M=Y[Y.length-1],ae=ie=>{if(!Rt)return;gn=!0;const xe=ie.latlng,st=Date.now();{const Pe=dt=>dt*Math.PI/180,St=(dt,Nt)=>{const Kn=Pe(Nt[0]-dt[0]),on=Pe(Nt[1]-dt[1]),bn=Math.sin(Kn/2)**2+Math.cos(Pe(dt[0]))*Math.cos(Pe(Nt[0]))*Math.sin(on/2)**2;return 12742*Math.atan2(Math.sqrt(bn),Math.sqrt(1-bn))},Tt=[xe.lat,xe.lng],Ct=St(Vt,Tt)+St(Tt,M),Ut=(x._lastLegDistances||[]).reduce((dt,Nt,Da)=>Da!==E?dt+Nt:dt,0)+Ct;if(Number.isFinite(Ut)){const dt=Math.round(Ut*15);me(Nt=>({...Nt,distanceKm:Ut,durationMin:dt})),m==null||m({distanceKm:Ut,trailKm:Ut,durationMin:dt,mappedCount:Z.length,measured:!1})}}if(ot||(ot=Q.polyline([Vt,[xe.lat,xe.lng],M],{color:"#ff0000",weight:7,dashArray:"8, 8",opacity:.95,noClip:!0,renderer:pe.current??void 0}).addTo(x)),st-Wn>350){Wn=st;const Pe=`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${Vt[1]},${Vt[0]};${xe.lng},${xe.lat};${M[1]},${M[0]}?overview=full&geometries=geojson`;fetch(Pe).then(St=>St.json()).then(St=>{var Tt,Ct,hn;if(Rt&&((hn=(Ct=(Tt=St.routes)==null?void 0:Tt[0])==null?void 0:Ct.geometry)!=null&&hn.coordinates)){const Un=St.routes[0],Ut=Un.geometry.coordinates.map(([dt,Nt])=>[Nt,dt]);if(ot){ot.setLatLngs(Ut),ot.setStyle({dashArray:void 0,color:"#ff0000",weight:8});const dt=Un.distance/1e3,Nt=(Un.duration||0)/60,Kn=(x._lastLegDistances||[]).reduce((Jn,cs,us)=>us!==E?Jn+cs:Jn,0),on=Kn+dt,bn=Math.round(Nt+Kn*15);Number.isFinite(on)&&(me(Jn=>({...Jn,distanceKm:on,durationMin:bn})),m==null||m({distanceKm:on,trailKm:on,durationMin:bn,mappedCount:Z.length,measured:!0}))}}}).catch(()=>{})}},V=ie=>{ie.originalEvent&&Q.DomEvent.stopPropagation(ie.originalEvent),x.off("mousemove",ae),x.off("mouseup",V),x.dragging.enable(),U.current=Date.now()+800,_e.current&&window.clearTimeout(_e.current),_e.current=window.setTimeout(()=>{ee.current=!1},120),ot&&(x.removeLayer(ot),ot=null),Rt=!1,ee.current=!1,Je.setStyle({color:"#10b981",weight:6}),Ee.setStyle({color:"#047857",weight:11}),gn&&L&&l&&l(L,[ie.latlng.lat,ie.latlng.lng])};x.on("mousemove",ae),x.on("mouseup",V)};Je.on("mousedown",Vn),Ee.on("mousedown",Vn),Je.on("click",Qn),Ee.on("click",Qn);const fn=[Ee,Je];et&&fn.push(et),xt&&fn.push(xt),v.current.push(...fn)}),T.forEach((R,E)=>{E!==0&&ao(R).forEach(O=>{const L=Q.circleMarker(O,{radius:7,color:"#ffffff",weight:2,fillColor:"#f59e0b",fillOpacity:.95}).addTo(x);L.bindTooltip("🟠 Punto de moldeado del camino (doble clic para quitar)",{sticky:!0}),L.on("dblclick",I=>{Q.DomEvent.stopPropagation(I.originalEvent),Q.DomEvent.preventDefault(I.originalEvent),l==null||l(R,null)}),v.current.push(L)})}),Z.length>0&&Z.slice(0,3).forEach(([R,E])=>{const O=`https://overpass-api.de/api/interpreter?data=[out:json];way(around:500,${R},${E})["highway"~"footway|path|track|steps"];out geom;`;fetch(O).then(L=>L.json()).then(L=>{L&&L.elements&&L.elements.forEach(I=>{if(I.geometry&&I.geometry.length>=2){const J=I.geometry.map(Qe=>[Qe.lat,Qe.lon]),Y=Q.polyline(J,{color:"#eab308",weight:3.5,opacity:.75,dashArray:"6, 6",noClip:!0,interactive:!1,renderer:pe.current??void 0}).addTo(x);v.current.push(Y)}})}).catch(()=>{})})}else A.length>0?(console.warn("SAGA ruta: respuesta del router sin trazado utilizable",X),v.current.push(...A)):(console.warn("SAGA ruta: respuesta del router sin trazado utilizable",X),ce(x))}).catch(X=>{console.error("SAGA ruta: fallo al calcular el trazado",X),A.length>0?v.current.push(...A):ce(x)})}}function ce(P){const W=Q.polyline(Z,{color:"#dc2626",weight:6,opacity:.9,dashArray:"8, 8",noClip:!0,renderer:pe.current??void 0}).addTo(P);v.current.push(W),h.current=Z}const Ce=[];Se.forEach(P=>{let W=ft(P);if(!W)return;const oe=(t==null?void 0:t.index)===P.index,ge=Ds(P,oe),le=Fs(P);Ce.push(W);const We=Q.circle(W,{radius:le,color:ge.color,weight:ge.ringWeight,opacity:oe?.94:.62,fillColor:ge.color,fillOpacity:ge.ringOpacity,className:oe?"admin-node-ring admin-node-ring--selected":"admin-node-ring",bubblingMouseEvents:!1,interactive:!tt}).addTo(x),H=x.getZoom(),Re=W,be=Se.filter(_=>{const k=ft(_);return!k||_.index===P.index?!1:x.distance(Re,k)<(H>=17?25:H>=15?90:220)});if(be.length>0){const _=be.filter(k=>k.index<P.index).length;if(_>0){const k=_*2*Math.PI/(be.length+1),j=26+_*4,q=x.latLngToLayerPoint(Q.latLng(Re)),$=Q.point(q.x+Math.cos(k)*j,q.y+Math.sin(k)*j),F=x.layerPointToLatLng($);W=[F.lat,F.lng]}}const se=oe?74:H<15?46:62,X=Q.marker(W,{draggable:!!o,autoPan:!0,icon:Q.divIcon({className:"admin-node-marker-icon",html:Os(P,oe,ge.color,ge.fillColor),iconSize:[se,se],iconAnchor:[se/2,se/2]})}).addTo(x),Ae=$s(P),ne=Ae?`${Ae} · ${P.title||"Nodo"}`:P.title||"Untitled node",Me=`${P.index+1}. ${ne} · ${Ri(P)} · ${le}m`;X.bindTooltip(Me,{direction:"top",opacity:.96}),X.bindPopup(Bs(P,Se.length),{closeButton:!0,autoPan:!0,keepInView:!0}),X.on("popupopen",()=>{var j;const _=(j=X.getPopup())==null?void 0:j.getElement(),k=_==null?void 0:_.querySelector(".admin-popup-edit-btn");k&&k.addEventListener("click",q=>{q.stopPropagation(),a==null||a(P)})}),We.on("click",_=>{Q.DomEvent.stopPropagation(_.originalEvent),Q.DomEvent.preventDefault(_.originalEvent),!(x.getContainer().classList.contains("admin-map-dragging-node")||Date.now()<U.current)&&(a==null||a(P),X.openPopup())}),X.on("click",_=>{Q.DomEvent.stopPropagation(_.originalEvent),Q.DomEvent.preventDefault(_.originalEvent),!(x.getContainer().classList.contains("admin-map-dragging-node")||Date.now()<U.current)&&(a==null||a(P),X.openPopup())}),X.on("dragstart",()=>{ee.current=!0,_e.current&&window.clearTimeout(_e.current),U.current=Date.now()+700,x.getContainer().classList.add("admin-map-dragging-node")});let ye=null,ze=0;X.on("drag",()=>{U.current=Date.now()+700;const _=Date.now(),k=X.getLatLng();We.setLatLng(k);const j=Se.map(q=>q.index===P.index?[k.lat,k.lng]:ft(q)).filter(q=>q!==null);if(j.length>=2){let q=0;for(let R=0;R<j.length-1;R++){const[E,O]=j[R],[L,I]=j[R+1],J=6371,Y=(L-E)*Math.PI/180,Qe=(I-O)*Math.PI/180,Ee=Math.sin(Y/2)**2+Math.cos(E*Math.PI/180)*Math.cos(L*Math.PI/180)*Math.sin(Qe/2)**2,Je=2*Math.atan2(Math.sqrt(Ee),Math.sqrt(1-Ee));q+=J*Je}const $=q*1.3,F=Math.round($*15);me(R=>({...R,distanceKm:$,durationMin:F})),m==null||m({distanceKm:$,trailKm:$,durationMin:F,measured:!1})}if(_-ze>350){ze=_;const q=T.findIndex(F=>F.index===P.index),$=[];if(q>0){const F=ft(T[q-1]);F&&$.push(F)}if($.push([k.lat,k.lng]),q<T.length-1){const F=ft(T[q+1]);F&&$.push(F)}if($.length>=2){const R=`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${$.map(([E,O])=>`${O},${E}`).join(";")}?overview=full&geometries=geojson`;fetch(R).then(E=>E.json()).then(E=>{var O,L,I;if(x.getContainer().classList.contains("admin-map-dragging-node")&&((I=(L=(O=E.routes)==null?void 0:O[0])==null?void 0:L.geometry)!=null&&I.coordinates)){const J=E.routes[0].geometry.coordinates.map(([Y,Qe])=>[Qe,Y]);ye?ye.setLatLngs(J):ye=Q.polyline(J,{color:"#ff0000",weight:8,dashArray:"8, 8",opacity:.95,noClip:!0,renderer:pe.current??void 0}).addTo(x)}}).catch(()=>{})}}}),X.on("dragend",_=>{ye&&(x.removeLayer(ye),ye=null);const k=_.originalEvent;k&&(Q.DomEvent.stopPropagation(k),Q.DomEvent.preventDefault(k)),U.current=Date.now()+700,_e.current&&window.clearTimeout(_e.current),_e.current=window.setTimeout(()=>{ee.current=!1},120),x.getContainer().classList.remove("admin-map-dragging-node");const j=X.getLatLng();o==null||o(P,j.lat,j.lng,{select:!1})}),f.current.push(We,X)});const Ne=T.slice(1).every(P=>io(P).length>=2);for(let P=0;!Ne&&P<Se.length-1;P++){const W=ft(Se[P]),oe=ft(Se[P+1]);if(!W||!oe)continue;const ge=Q.polyline([W,oe],{color:"rgba(148,163,184,0.25)",weight:1.5,opacity:.7,dashArray:"4 8",noClip:!0,renderer:pe.current??void 0}).addTo(x);f.current.push(ge)}const Be={llave_maestra:["llave_rota","cinta_aislante"],emp_device:["bateria_litio","cables_cobre","placa_base"]};function $e(P){return String(P||"").trim().toLowerCase().replace(/[- ]/g,"_")}Se.forEach(P=>{const W=P,oe=W!=null&&W.config&&typeof W.config=="object"?W.config:{},ge=$e((W==null?void 0:W.required_item_id)??(oe==null?void 0:oe.required_item_id)??(oe==null?void 0:oe.item_id)??"");if(!ge)return;const le=ft(P);if(!le)return;const We=(Be[ge]||[ge]).map($e),H=!!Be[ge];We.forEach(Re=>{Se.forEach(be=>{var ne;if(be===P)return;const se=be,X=se!=null&&se.config&&typeof se.config=="object"?se.config:{},Ae=$e(se.physical_item_id||(X==null?void 0:X.physical_item_id)||(se==null?void 0:se.physical_qr)&&typeof se.physical_qr=="object"&&((ne=se.physical_qr)==null?void 0:ne.item_id)||"");if(Ae&&Ae===Re){const Me=ft(be);if(!Me)return;const ye=H?"#a78bfa":"#38bdf8",ze=Q.polyline([Me,le],{color:ye,weight:3,opacity:.9,className:"admin-dependency-polyline",noClip:!0,renderer:pe.current??void 0}).addTo(x),_=se.title||se.physical_item_label||`Nodo ${be.index+1}`,k=W.title||`Nodo ${P.index+1}`,j=H?`🔧 Ingrediente: "${Re}" de ${be.index+1} (${_}) → receta de "${ge}" requerida en ${P.index+1} (${k})`:`🔑 Requisito: "${ge}" obtenido en ${be.index+1} (${_}) → necesario para ${P.index+1} (${k})`;ze.bindTooltip(j,{sticky:!0,opacity:.96}),f.current.push(ze)}})})}),!gt.current&&Ce.length>0&&(gt.current=!0,Ce.length>1?x.fitBounds(Q.latLngBounds(Ce),{padding:[56,56],maxZoom:16,animate:!0,duration:.35}):Ce.length===1&&x.setView(Ce[0],16,{animate:!0,duration:.35})),x.invalidateSize({pan:!1})},[Se,t,a,o,l,d,tt,Ue]),S.useEffect(()=>{const x=w.current;if(!x)return;if(N.current.forEach(T=>T.remove()),N.current=[],!De){Fe("idle"),we(0);return}Fe("loading"),ln().then(T=>{const Z=(T==null?void 0:T.profiles)||[];let ce=0;const Ce=["#f43f5e","#f97316","#a855f7","#3b82f6","#10b981","#eab308"];Z.forEach((Ne,Be)=>{const $e=Ne.lat??Ne.live_lat??Ne.last_lat,P=Ne.lon??Ne.live_lon??Ne.last_lon;if(typeof $e!="number"||typeof P!="number"||$e===0&&P===0)return;ce++;const W=Ce[Be%Ce.length],oe=String(Ne.name||Ne.id||`Jugador ${Be+1}`),ge=Q.circleMarker([$e,P],{radius:14,color:W,fillColor:W,fillOpacity:.28,weight:3,opacity:.9,className:"admin-player-position-ring"}).addTo(x),le=Q.divIcon({className:"",iconSize:[10,10],html:`<div class="admin-player-dot" style="background:${W};" title="${oe}"></div>`}),We=Q.marker([$e,P],{icon:le,interactive:!1}).addTo(x);ge.bindTooltip(`👤 ${oe}<br/>📍 ${$e.toFixed(5)}, ${P.toFixed(5)}<br/><small>${Ne.gps_status||"ok"}</small>`,{sticky:!0,opacity:.96}),N.current.push(ge,We)}),we(ce),Fe(ce>0?"ok":"empty")}).catch(T=>{console.error("Heatmap: error cargando posiciones",T),Fe("error")});const A=window.setInterval(()=>{De&&He(T=>T+1)},15e3);return()=>window.clearInterval(A)},[De,qe]),S.useEffect(()=>{if(!y||y===0)return;const x=w.current,A=h.current;if(!x||A.length<2)return;const T=Q.divIcon({className:"saga-route-animator",html:'<div style="width:40px; height:40px; display:flex; align-items:center; justify-content:center;"><div style="font-size:32px; color:#ffffff; font-weight:900; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.8)); transform-origin: center;">➤</div></div>',iconSize:[40,40],iconAnchor:[20,20]}),Z=Q.marker(A[0],{icon:T,zIndexOffset:9999,interactive:!1}).addTo(x);let ce=null;const Ce=8e3,Ne=A.reduce(($e,P,W)=>W===0?0:$e+x.distance(A[W-1],P),0);function Be($e){ce||(ce=$e);const P=$e-ce,W=Math.min(P/Ce,1);if(W>=1){Z.remove();return}const oe=W*Ne;let ge=0;for(let le=0;le<A.length-1;le++){const We=x.distance(A[le],A[le+1]);if(ge+We>=oe){const H=(oe-ge)/We,Re=A[le][0]+(A[le+1][0]-A[le][0])*H,be=A[le][1]+(A[le+1][1]-A[le][1])*H;Z.setLatLng([Re,be]);const se=x.latLngToLayerPoint(A[le]),X=x.latLngToLayerPoint(A[le+1]),Ae=Math.atan2(X.y-se.y,X.x-se.x)*(180/Math.PI),ne=Z.getElement();ne&&ne.firstElementChild&&ne.firstElementChild.firstElementChild&&(ne.firstElementChild.firstElementChild.style.transform=`rotate(${Ae}deg)`);break}ge+=We}requestAnimationFrame(Be)}requestAnimationFrame(Be)},[y]),S.useEffect(()=>{const x=w.current,A=t?ft(t):null;if(!x||!A)return;const T=Q.latLng(A);x.getBounds().contains(T)||x.panTo(A,{animate:!0,duration:.35})},[t]),n.jsxs("section",{style:Hs,children:[n.jsx("style",{children:Qs}),n.jsx("div",{ref:b,style:Ws,"aria-label":"React admin mission map"})]})}const Hs={position:"relative",minHeight:580,borderRadius:28,overflow:"hidden",border:"1px solid rgba(148,163,184,0.22)",background:"rgba(2,6,23,0.42)",boxShadow:"0 20px 54px rgba(0,0,0,0.30)"},Ws={position:"absolute",inset:0,zIndex:1},Qs=`
.admin-osm-multiply-layer {
  mix-blend-mode: multiply !important;
  filter: contrast(150%) brightness(92%);
}

.admin-node-ring {
  cursor: pointer;
  filter: drop-shadow(0 8px 18px rgba(15,23,42,.24));
}

.admin-node-ring--selected {
  animation: adminNodePulse 1200ms ease-in-out infinite;
}

.admin-node-marker-icon {
  display: grid;
  place-items: center;
  background: transparent;
  border: 0;
  /* Sólo el círculo del pin recibe el ratón */
  pointer-events: none;
}

.admin-node-marker-icon .admin-node-pin {
  pointer-events: auto;
}

.admin-node-pin-shell {
  position: relative;
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  transform: translateZ(0);
}

.admin-node-pin-shell--selected {
  width: 74px;
  height: 74px;
}

.admin-node-pin {
  display: grid;
  place-items: center;
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 4px solid var(--node-color);
  background:
    radial-gradient(circle at 38% 28%, rgba(255,255,255,.95), rgba(255,255,255,.68) 28%, var(--node-fill) 72%);
  color: #020617;
  box-shadow:
    0 0 0 5px rgba(255,255,255,.24),
    0 0 0 10px rgba(15,23,42,.20),
    0 12px 28px rgba(2,6,23,.40);
  cursor: grab;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.admin-node-pin--selected {
  width: 42px;
  height: 42px;
  border-width: 5px;
  box-shadow:
    0 0 0 7px rgba(255,255,255,.30),
    0 0 0 14px rgba(14,165,233,.18),
    0 0 28px rgba(255,255,255,.62),
    0 18px 34px rgba(2,6,23,.46);
}

.admin-node-pin:hover {
  transform: scale(1.08);
}

.admin-node-pin__index {
  font-size: 14px;
  font-weight: 950;
  line-height: 1;
}

.admin-node-pin__grip {
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(226,232,240,.92);
  text-shadow: 0 1px 4px rgba(0,0,0,.7);
  font-size: 11px;
  letter-spacing: -4px;
}

.admin-node-label {
  /* La etiqueta no debe capturar el ratón: arrastrando el texto se movía el
     nodo sin querer. El nodo sólo se arrastra desde su círculo. */
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: calc(100% - 5px);
  transform: translateX(-50%);
  display: none;
  min-width: 120px;
  max-width: 220px;
  padding: 7px 9px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(2,6,23,.78);
  box-shadow: 0 12px 24px rgba(2,6,23,.28);
  color: #f8fafc;
  text-align: center;
  backdrop-filter: blur(14px);
  pointer-events: none;
}

.admin-node-label strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.admin-node-label span {
  display: block;
  margin-top: 2px;
  color: #bae6fd;
  font-size: 10px;
  font-weight: 800;
}

.admin-node-label--selected {
  display: block;
}

.admin-map-dragging-node .admin-node-pin {
  cursor: grabbing;
  transform: scale(1.12);
}

.admin-node-marker-icon:hover .admin-node-label {
  display: block;
}

.admin-node-ring:hover {
  opacity: .92;
}

.leaflet-control-zoom {
  border: 0 !important;
  box-shadow: 0 12px 28px rgba(2,6,23,.28) !important;
}

.leaflet-control-zoom a {
  background: rgba(2,6,23,.74) !important;
  color: #f8fafc !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  backdrop-filter: blur(14px);
}


.admin-node-pin__physical {
  position: absolute;
  top: -11px;
  right: -11px;
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,.92);
  background: rgba(2,6,23,.86);
  box-shadow:
    0 7px 18px rgba(2,6,23,.42),
    inset 0 1px 0 rgba(255,255,255,.16);
  font-size: 13px;
  line-height: 1;
  z-index: 2;
}

.admin-node-pin__physical--collectible {
  background: rgba(113,63,18,.92);
}

.admin-node-pin__physical--requirement {
  background: rgba(30,64,175,.92);
}

.admin-node-pin__physical--clue {
  background: rgba(20,83,45,.92);
}

.admin-node-pin__physical--bonus {
  background: rgba(157,23,77,.92);
}

.admin-node-label__physical {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-right: 5px;
  border-radius: 999px;
  background: rgba(255,255,255,.12);
  font-size: 11px;
  vertical-align: -3px;
}

@keyframes adminNodePulse {
  0% { stroke-opacity: .92; fill-opacity: .24; }
  50% { stroke-opacity: .36; fill-opacity: .08; }
  100% { stroke-opacity: .92; fill-opacity: .24; }
}
`,ba=[{id:"motion_challenge",icon:"⚡",title:"Motion Challenge",detail:"Movimiento del móvil, agitar, calibrar y retos físicos."},{id:"signal_hunt",icon:"📍",title:"Checkpoints GPS",detail:"Puntos de control, mensajes rápidos y captura de zona GPS."},{id:"bearing_hunt",icon:"🧭",title:"Bearing Hunt",detail:"Compass heading, sector lock and orientation capture."},{id:"circuit_matrix",icon:"🧩",title:"Circuit Matrix",detail:"Logic grids, route repair and lock-style board puzzles."},{id:"audio_challenge",icon:"🎤",title:"Audio Challenge",detail:"Micrófono del dispositivo, soplado o volumen de sonido."}];function Mi(e){return e==="motion_challenge"?"Motion Challenge":e==="bearing_hunt"?"Bearing Hunt":e==="circuit_matrix"?"Matriz de circuitos":e==="sequence_code"?"Simón Dice":e==="place_mosaic"?"Mosaico del lugar":e==="tilt_maze"?"Laberinto de equilibrio":e==="spark_radar"?"Caza-Señales":e==="audio_challenge"?"Desafío de audio":"Checkpoint GPS"}function Vs(e){return e==="motion_challenge"?"⚡":e==="bearing_hunt"?"🧭":e==="circuit_matrix"?"🧩":e==="sequence_code"?"🔢":e==="place_mosaic"?"🖼️":e==="tilt_maze"?"🎱":e==="spark_radar"?"📡":e==="audio_challenge"?"🎤":"📍"}function Ir(e,t){return{type:e,version:"v1",label:Mi(e),config:t}}function ve(e,t){const a=Number(e);return Number.isFinite(a)?a:t}function Ba(e){const t=String(e??"").trim().toLowerCase();return t==="easy"||t==="facil"||t==="fácil"||t==="1"?"easy":t==="hard"||t==="dificil"||t==="difícil"||t==="3"||t==="4"||t==="5"?"hard":"normal"}function Us(e){return Array.isArray(e)?e.map(t=>String(t).trim()).filter(Boolean).slice(0,10):[]}function Ks(e){return e==="motion_challenge"?{objective:"shake_charge",game_id:"shake_antenna_charge",difficulty:"normal",duration_mode:"normal",penalty_mode:"normal",allow_touch_fallback:!0,energy_target:100,time_limit_ms:35e3,stabilize_ms:2e3,calibration_ms:1e3,good_min:1.2,good_max:3.8,overcharge_threshold:5.4,idle_decay:.15,charge_rate:2.4,stability_min:35,use_vibration:!0}:e==="bearing_hunt"?{objective:"single_lock",target_bearing_deg:270,tolerance_deg:12,hold_ms:1200}:e==="circuit_matrix"?{objective:"path_restore",game_id:"logic_circuit",completion_method:"puzzle",grid_cols:5,grid_rows:5,difficulty:"normal",max_errors:3,preview_cell_ms:460,path_length:11,seed:"",pattern_mode:"random_each_game",path_cells:[]}:e==="audio_challenge"?{objective:"blow_charge",game_id:"audio_challenge"}:{objective:"proximity_lock",source_radius_m:75,lock_threshold:65,hold_ms:1500}}function xa(e,t){const a=t||{},i=Js(e,a);for(const r of["is_map_collectible","game_id","game_title","completion_method"])r in a&&(r==="is_map_collectible"?i[r]=!!a[r]:i[r]=String(a[r]).trim());return i}function Js(e,t){const a=t||{};if(e==="audio_challenge")return{objective:String(a.objective||"blow_charge"),game_id:String(a.game_id||"audio_challenge")};if(e==="motion_challenge")return{objective:String(a.objective||"shake_charge"),game_id:String(a.game_id||"shake_antenna_charge"),difficulty:String(a.difficulty||"normal"),duration_mode:String(a.duration_mode||"normal"),penalty_mode:String(a.penalty_mode||"normal"),allow_touch_fallback:a.allow_touch_fallback!==!1,energy_target:ve(a.energy_target,100),time_limit_ms:ve(a.time_limit_ms,35e3),stabilize_ms:ve(a.stabilize_ms,2e3),calibration_ms:ve(a.calibration_ms,1e3),good_min:ve(a.good_min,1.2),good_max:ve(a.good_max,3.8),overcharge_threshold:ve(a.overcharge_threshold,5.4),idle_decay:ve(a.idle_decay,.15),charge_rate:ve(a.charge_rate,2.4),stability_min:ve(a.stability_min,35),use_vibration:a.use_vibration!==!1};if(e==="bearing_hunt"){const i=a.target_bearing_deg!==void 0?a.target_bearing_deg:a.target_bearing;return{objective:String(a.objective||"single_lock"),target_bearing_deg:ve(i,270),tolerance_deg:ve(a.tolerance_deg,12),hold_ms:ve(a.hold_ms,1200)}}if(e==="circuit_matrix"&&(a.game_id==="tilt_maze"||a.objective==="balance_maze")){const i=Ba(a.difficulty),r=i==="easy"?7:i==="hard"?11:9;return{objective:"balance_maze",game_id:"tilt_maze",completion_method:"motion",difficulty:i,grid_rows:Math.max(5,Math.min(13,Math.round(ve(a.grid_rows,r)))),grid_cols:Math.max(5,Math.min(13,Math.round(ve(a.grid_cols,r)))),pattern_mode:a.pattern_mode==="random_each_game"?"random_each_game":"fixed",maze_seed:String(a.maze_seed||"saga-maze").trim().slice(0,80)||"saga-maze",time_limit_s:Math.max(20,Math.min(180,Math.round(ve(a.time_limit_s,75)))),lives:Math.max(1,Math.min(5,Math.round(ve(a.lives,3)))),hole_count:Math.max(0,Math.min(18,Math.round(ve(a.hole_count,4)))),collectible_count:Math.max(0,Math.min(6,Math.round(ve(a.collectible_count,2)))),sensor_enabled:a.sensor_enabled!==!1,tilt_threshold:Math.max(6,Math.min(30,Math.round(ve(a.tilt_threshold,12)))),step_cooldown_ms:Math.max(180,Math.min(800,Math.round(ve(a.step_cooldown_ms,360))))}}if(e==="circuit_matrix"&&(a.game_id==="place_mosaic"||a.objective==="image_mosaic")){const i=Math.max(2,Math.min(4,Math.round(ve(a.grid_size??a.grid_cols??a.grid_rows,3)))),r=String(a.image_data_url||"").trim(),o=r.length<=6e5&&(r.startsWith("data:image/jpeg;base64,")||r.startsWith("data:image/png;base64,")||r.startsWith("data:image/webp;base64,")),l=Array.isArray(a.final_choices)?a.final_choices.map(c=>String(c).trim().slice(0,60)).filter(Boolean).slice(0,4):[],d=l.length>=2?l:["Puerta","Escudo","Campana"],s=Math.max(0,Math.min(d.length-1,Math.round(ve(a.final_correct_index,0))));return{objective:"image_mosaic",game_id:"place_mosaic",completion_method:"puzzle",image_data_url:o?r:"",image_alt:String(a.image_alt||"").trim().slice(0,120),grid_size:i,grid_cols:i,grid_rows:i,preview_ms:Math.max(0,Math.min(6e3,Math.round(ve(a.preview_ms,2500)))),max_moves:Math.max(0,Math.min(500,Math.round(ve(a.max_moves,0)))),require_final_question:a.require_final_question===!0,final_question:String(a.final_question||"¿Qué detalle aparece en el lugar real?").trim().slice(0,180),final_choices:d,final_correct_index:s}}if(e==="circuit_matrix"&&(a.game_id==="sequence_code"||a.objective==="sequence_order"))return{objective:"sequence_order",game_id:"sequence_code",completion_method:"sequence",sequence:Us(a.sequence),difficulty:Ba(a.difficulty),max_attempts:Math.max(1,Math.min(8,Math.round(ve(a.max_attempts,3)))),hint_text:String(a.hint_text||"").trim().slice(0,240),shuffle_choices:!0};if(e==="circuit_matrix"){const i=Array.isArray(a.path_cells)?a.path_cells.map(String):[],r=a.pattern_mode==="fixed"||i.length>=4?"fixed":"random_each_game";return{objective:String(a.objective||"path_restore"),game_id:String(a.game_id||"logic_circuit"),completion_method:"puzzle",grid_cols:ve(a.grid_cols??a.grid_size,5),grid_rows:ve(a.grid_rows??a.grid_size,5),difficulty:Ba(a.difficulty),max_errors:ve(a.max_errors,3),preview_cell_ms:ve(a.preview_cell_ms,460),path_length:r==="fixed"?i.length:ve(a.path_length,11),seed:String(a.seed||""),pattern_mode:r,path_cells:i}}return{objective:String(a.objective||"proximity_lock"),source_radius_m:ve(a.source_radius_m,75),lock_threshold:ve(a.lock_threshold,65),hold_ms:ve(a.hold_ms,1500)}}const Ge=[{id:"simple_checkpoint",title:"Checkpoint / Texto Rápido",icon:"📍",family:"signal_hunt",category:"gps",difficulty:"Fácil",duration:"1 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"proximity",offlineNote:"Solo requiere llegar a las coordenadas GPS.",summary:"Nodo básico de control. El jugador llega al punto y lee el texto o pista.",playerGoal:"Llega al punto de control para avanzar en la ruta.",editorHint:"Ideal para inicio de ruta, puntos intermedios y revelación de historia.",config:{game_id:"simple_checkpoint",objective:"checkpoint",completion_method:"proximity"},content:"Punto de control alcanzado. Lee la información antes de continuar.",messages:{hint:"Revisa las coordenadas en el mapa.",gps_unavailable:"Sin cobertura GPS.",locked:"Acércate al punto para continuar."}},{id:"logic_circuit",title:"Matriz de circuitos",icon:"🧩",family:"circuit_matrix",category:"logic",difficulty:"Media",duration:"4-7 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"puzzle",offlineNote:"Funciona completamente en local y sincroniza el resultado después.",summary:"Juego táctil de reparar una ruta de energía en una matriz.",playerGoal:"Memorizar una ruta y repetirla en el orden exacto.",editorHint:"Úsalo cuando quieras un descanso mental entre puntos GPS.",config:{objective:"path_restore",completion_method:"puzzle",grid_cols:5,grid_rows:5,difficulty:"normal",max_errors:3,preview_cell_ms:460,path_length:11,seed:"",pattern_mode:"random_each_game",path_cells:[],game_id:"logic_circuit"},content:"Memoriza la ruta de energía y repítela en el mismo orden.",messages:{hint:"Memoriza la secuencia. Después repítela sin guía.",gps_unavailable:"Este reto puede jugarse sin GPS si el nodo ya está abierto.",locked:"Completa el circuito para continuar."}},{id:"sequence_code",title:"Simón Dice",icon:"🎨",family:"circuit_matrix",category:"logic",difficulty:"Media",duration:"2-5 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"sequence",offlineNote:"Funciona completamente en local y sincroniza el resultado al recuperar conexión.",summary:"Memoriza y repite la secuencia de cuadrados de colores.",playerGoal:"Memorizar la secuencia de colores y repetirla sin fallar.",editorHint:"Ajusta niveles, número de colores y velocidad. La vista previa enseña el patrón real.",config:{objective:"sequence_order",game_id:"sequence_code",completion_method:"sequence",levels:5,pad_count:4,step_ms:620,sound_enabled:!0,seed:"saga-simon"},content:"Memoriza la secuencia de colores y repítela. Cada nivel añade un color más.",messages:{hint:"Si fallas vuelves al nivel 1, pero la secuencia es siempre la misma.",gps_unavailable:"Este reto funciona sin GPS cuando el nodo está abierto.",locked:"Completa la secuencia para continuar."}},{id:"place_mosaic",title:"Mosaico del lugar",icon:"🖼️",family:"circuit_matrix",category:"photo",difficulty:"Media",duration:"3-8 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"puzzle",offlineNote:"La fotografía viaja dentro de la misión y el puzle funciona completamente sin conexión.",summary:"Reconstruir una fotografía del lugar real intercambiando sus piezas.",playerGoal:"Observar el entorno, ordenar el mosaico y reconocer un detalle del punto real.",editorHint:"Sube una fotografía clara del molino, estatua, edificio, piedra o detalle que el jugador tendrá delante.",config:{objective:"image_mosaic",game_id:"place_mosaic",completion_method:"puzzle",image_data_url:"",image_alt:"",grid_size:3,grid_cols:3,grid_rows:3,preview_ms:2500,max_moves:0,require_final_question:!1,final_question:"¿Qué detalle aparece en el lugar real?",final_choices:["Puerta","Escudo","Campana"],final_correct_index:0},content:"Reconstruye la fotografía observando el lugar real.",messages:{hint:"Compara formas, colores y detalles con el elemento que tienes delante.",gps_unavailable:"Este reto puede jugarse sin GPS cuando el nodo ya está abierto.",locked:"Completa el mosaico para continuar."}},{id:"tilt_maze",title:"Laberinto de equilibrio",icon:"🎱",family:"circuit_matrix",category:"motion",difficulty:"Media",duration:"2-6 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"motion",offlineNote:"El laberinto, los controles táctiles y el sensor funcionan completamente sin conexión.",summary:"Guiar una bola por un laberinto generado automáticamente inclinando el móvil.",playerGoal:"Recoger los objetos, evitar los agujeros y alcanzar la salida.",editorHint:"Elige tamaño y dificultad. Puedes fijar un laberinto o generar uno nuevo en cada partida.",config:{objective:"balance_maze",game_id:"tilt_maze",completion_method:"motion",difficulty:"normal",grid_rows:9,grid_cols:9,pattern_mode:"fixed",maze_seed:"saga-maze",time_limit_s:75,lives:3,hole_count:4,collectible_count:2,sensor_enabled:!0,tilt_threshold:12,step_cooldown_ms:360},content:"Inclina el móvil o usa los botones para guiar la bola hasta la salida.",messages:{hint:"Muévete despacio, recoge los objetos y evita los agujeros.",gps_unavailable:"Este reto funciona sin GPS cuando el nodo está abierto.",locked:"Supera el laberinto para continuar."}},{id:"spark_radar",title:"Caza-Señales",icon:"📡",family:"circuit_matrix",category:"motion",difficulty:"Fácil",duration:"1-2 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"motion",offlineNote:"Todo ocurre en el móvil: no necesita conexión, ni GPS, ni sensores.",summary:"Radar de reflejos: toca las señales verdes y esquiva los ecos rojos.",playerGoal:"Alcanzar el número de señales antes de que acabe el tiempo.",editorHint:"Sube el objetivo o baja el tiempo para hacerlo más difícil. Los ecos rojos restan segundos.",config:{objective:"spark_radar",game_id:"spark_radar",completion_method:"motion",target_hits:12,time_limit_s:45,spawn_interval_ms:700,spark_life_ms:1600,echo_ratio:.28,echo_penalty_s:2},content:"Sintoniza el radar y captura las señales buenas antes de que se apaguen.",messages:{hint:"Toca sólo las chispas verdes. Las rojas te quitan tiempo.",gps_unavailable:"Este reto funciona sin GPS cuando el nodo está abierto.",locked:"Recupera las señales para continuar."}},{id:"qr_collectible",title:"Objeto QR",icon:"⭐",family:"signal_hunt",category:"physical",difficulty:"Fácil",duration:"1-2 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"inventory_only",offlineNote:"Crea tarjeta QR en admin, se exporta, el player la lee offline y guarda el objeto en mochila local.",summary:"Tarjeta física opcional que se guarda en la mochila.",playerGoal:"Escanear una tarjeta QR y conservar el objeto.",editorHint:"Úsalo para coleccionables, logros o pistas secundarias.",config:{objective:"physical_collectible",completion_method:"inventory_only",game_id:"qr_collectible"},content:"Encuentra y escanea la tarjeta QR física.",messages:{hint:"Busca una tarjeta o símbolo físico cerca.",gps_unavailable:"Acércate al punto para escanear el QR.",locked:"Necesitas estar en la zona del QR."}},{id:"qr_key_gate",title:"Llave QR",icon:"🔑",family:"signal_hunt",category:"physical",difficulty:"Fácil",duration:"1-3 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"inventory_only",offlineNote:"Crea llave QR en admin, se exporta, el player la lee offline y guarda la llave para requisitos.",summary:"Objeto QR pensado para abrir otro nodo posterior.",playerGoal:"Conseguir una llave física para desbloquear una prueba.",editorHint:"Úsalo junto con Requisito de entrada en un nodo posterior.",config:{objective:"physical_key",completion_method:"inventory_only",game_id:"qr_key_gate"},content:"Escanea la llave QR. Podría hacer falta más adelante.",messages:{hint:"Busca la llave física.",gps_unavailable:"Activa GPS o usa el modo permitido para abrir el QR.",locked:"Acércate para registrar la llave."}},{id:"clue_card",title:"Pista QR",icon:"🧩",family:"signal_hunt",category:"physical",difficulty:"Fácil",duration:"1-2 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"inventory_only",offlineNote:"Crea pista QR en admin, se exporta, el player la lee offline y guarda la pista consultable en mochila.",summary:"Tarjeta que entrega información para resolver otro reto.",playerGoal:"Escanear una pista y leer la información.",editorHint:"Ideal para rutas de misterio o escape.",config:{objective:"physical_clue",completion_method:"inventory_only",game_id:"clue_card"},content:"Escanea la pista y úsala en un nodo posterior.",messages:{hint:"La pista no está lejos del punto.",gps_unavailable:"Necesitas abrir el nodo para escanear la pista.",locked:"Acércate para consultar la pista."}},{id:"photo_scout",title:"Foto de exploración",icon:"📷",family:"signal_hunt",category:"photo",difficulty:"Fácil",duration:"2-4 min",runtimeStatus:"planned",offlineStatus:"offline_planned",completionMethod:"photo",offlineNote:"No se ofrece en plantillas jugables todavía: falta completar el flujo de cierre por foto.",summary:"El equipo debe hacer una foto de campo en la zona.",playerGoal:"Capturar una foto compartida en el mapa.",editorHint:"Funciona muy bien con el sistema de fotos de campo.",config:{objective:"photo_proof",completion_method:"photo",game_id:"photo_scout"},content:"Haz una foto de campo que demuestre que encontraste la zona.",messages:{hint:"Busca un elemento reconocible del entorno.",gps_unavailable:"Necesitas ubicación para anclar la foto al mapa.",locked:"Acércate antes de hacer la foto."}},{id:"team_relay",title:"Relevo de equipo",icon:"👥",family:"signal_hunt",category:"team",difficulty:"Media",duration:"5-8 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"team",offlineNote:"Funciona offline. Si hay conexión usa Yjs para ver a los compañeros, si no, se cierra cuando todos registran el nodo.",summary:"Prueba pensada para varios jugadores o roles.",playerGoal:"Coordinarse para llegar, registrar prueba o compartir pista.",editorHint:"Úsalo si quieres que varios jugadores participen.",config:{objective:"team_relay",source_radius_m:80,lock_threshold:60,hold_ms:1500,game_id:"team_relay"},content:"El equipo debe coordinarse para completar esta parada.",messages:{hint:"Reparte roles: mapa, pista y foto.",gps_unavailable:"Al menos un jugador debe tener posición.",locked:"El equipo aún no está listo."}},{id:"manual_password",title:"Palabra clave",icon:"🔐",family:"circuit_matrix",category:"logic",difficulty:"Media",duration:"2-5 min",runtimeStatus:"planned",offlineStatus:"offline_planned",completionMethod:"manual_code",offlineNote:"No se ofrece en plantillas jugables todavía: falta validación local de código.",summary:"Resolver una palabra o código a partir de pistas.",playerGoal:"Descubrir una contraseña narrativa.",editorHint:"Bueno para carteles, acertijos y escape urbano.",config:{objective:"manual_code",completion_method:"manual_code",expected_code:"SAGA",difficulty:1,game_id:"manual_password"},content:"Encuentra la palabra clave y úsala para continuar.",messages:{hint:"La palabra está escondida en la escena.",gps_unavailable:"Este reto puede jugarse sin GPS si está desbloqueado.",locked:"La palabra clave no es correcta todavía."}},{id:"bonus_cache",title:"Bonus oculto",icon:"🎁",family:"signal_hunt",category:"physical",difficulty:"Fácil",duration:"1-3 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"inventory_only",offlineNote:"Crea bonus QR en admin, se exporta, el player lo lee offline y guarda la recompensa en mochila.",summary:"Extra opcional para recompensas, bromas o contenido secreto.",playerGoal:"Encontrar un extra no obligatorio.",editorHint:"Úsalo para dar vida al mapa sin bloquear la ruta.",config:{objective:"bonus_cache",completion_method:"inventory_only",game_id:"bonus_cache"},content:"Has encontrado un bonus oculto.",messages:{hint:"Hay algo extra cerca.",gps_unavailable:"Acércate para registrar el bonus.",locked:"El bonus aún no está a tu alcance."}},{id:"audio_challenge",title:"Desafío de audio",icon:"🎤",family:"audio_challenge",category:"motion",difficulty:"Fácil",duration:"2-4 min",runtimeStatus:"runtime_ready",offlineStatus:"offline_ready",completionMethod:"motion",offlineNote:"El micrófono y la validación funcionan offline en local.",summary:"Hacer ruido o soplar en el micrófono para cargar una barra.",playerGoal:"Mantener un nivel de ruido o soplar para cargar la barra.",editorHint:"Asegúrate de que los jugadores puedan usar el micrófono en su dispositivo.",config:{objective:"blow_charge",game_id:"audio_challenge"},content:"Sopla o haz ruido cerca del micrófono para cargar la energía.",messages:{hint:"Sopla suavemente de forma continua para llenar la barra.",gps_unavailable:"Este reto puede jugarse sin GPS si está desbloqueado.",locked:"Carga la barra completamente para continuar."}}],ui=[{id:"qr_route",title:"Ruta QR con llave",icon:"🔑",summary:"Juego base listo: ruta GPS, llave QR, nodo bloqueado y bonus opcional.",goodFor:"Primer juego real, rutas cortas, grupos pequeños, pruebas con tarjetas físicas.",stages:[{gameId:"logic_circuit",title:"Inicio de ruta",content:"Llega al punto inicial y activa la misión.",offsetLat:0,offsetLon:0,radius:55},{gameId:"qr_key_gate",title:"Llave del camino",content:"Escanea la llave QR física.",offsetLat:45e-5,offsetLon:28e-5,radius:45,physicalKind:"requirement",itemLabel:"Llave del camino"},{gameId:"logic_circuit",title:"Puerta bloqueada",content:"Este nodo pide la llave anterior.",offsetLat:88e-5,offsetLon:62e-5,radius:55,requiresPreviousItem:!0},{gameId:"bonus_cache",title:"Bonus final",content:"Extra opcional al terminar la ruta.",offsetLat:.00118,offsetLon:92e-5,radius:45,physicalKind:"bonus",itemLabel:"Bonus final"}]},{id:"clue_hunt",title:"Ruta de pistas QR",icon:"🧩",summary:"Cadena jugable de pistas físicas y búsqueda GPS, sin puzzles pendientes.",goodFor:"Misterio sencillo, historia local, juego familiar, rutas con tarjetas.",stages:[{gameId:"logic_circuit",title:"Punto de inicio",content:"Llega al punto de salida y abre la primera pista.",offsetLat:0,offsetLon:0,radius:55},{gameId:"clue_card",title:"Pista 1",content:"Escanea la primera pista QR.",offsetLat:42e-5,offsetLon:-3e-4,radius:45,physicalKind:"clue",itemLabel:"Pista 1"},{gameId:"logic_circuit",title:"Busca la señal",content:"La señal se hace más fuerte al acercarte.",offsetLat:8e-4,offsetLon:-58e-5,radius:55},{gameId:"bonus_cache",title:"Recompensa oculta",content:"Encuentra el bonus final.",offsetLat:.00108,offsetLon:-88e-5,radius:45,physicalKind:"bonus",itemLabel:"Recompensa oculta"}]},{id:"urban_escape",title:"Escape QR corto",icon:"🔐",summary:"Escape urbano simple con llave física y cierre GPS; evita pruebas aún planificadas.",goodFor:"Cidade, instituto, evento corto, juego con historia sin depender de conexión.",stages:[{gameId:"logic_circuit",title:"Entrada",content:"Activa el punto de entrada del escape.",offsetLat:0,offsetLon:0,radius:50},{gameId:"qr_key_gate",title:"Llave QR",content:"Escanea la llave física para abrir la salida.",offsetLat:-4e-4,offsetLon:36e-5,radius:45,physicalKind:"requirement",itemLabel:"Llave QR"},{gameId:"logic_circuit",title:"Salida bloqueada",content:"Usa la llave anterior y llega al punto de salida.",offsetLat:-75e-5,offsetLon:68e-5,radius:55,requiresPreviousItem:!0},{gameId:"clue_card",title:"Epílogo",content:"Escanea la tarjeta final de historia.",offsetLat:-.00105,offsetLon:95e-5,radius:45,physicalKind:"clue",itemLabel:"Epílogo"}]},{id:"family_gymkhana",title:"Gymkhana familiar",icon:"🎁",summary:"Ritmo variado con mosaico, lógica, objeto QR y bonus, todo jugable offline.",goodFor:"Niños, familias, grupos pequeños, parques y rutas sencillas.",stages:[{gameId:"logic_circuit",title:"Punto de salida",content:"Empieza la gymkhana.",offsetLat:0,offsetLon:0,radius:60},{gameId:"place_mosaic",title:"Observa el lugar",content:"Reconstruye la imagen usando el elemento real como referencia.",offsetLat:35e-5,offsetLon:35e-5,radius:55},{gameId:"qr_collectible",title:"Objeto del equipo",content:"Escanea el objeto QR del equipo.",offsetLat:65e-5,offsetLon:7e-4,radius:45,physicalKind:"collectible",itemLabel:"Objeto del equipo"},{gameId:"bonus_cache",title:"Regalo oculto",content:"Busca el bonus final.",offsetLat:95e-5,offsetLon:.00105,radius:45,physicalKind:"bonus",itemLabel:"Regalo oculto"}]}];function Lr(e){return Ge.find(t=>t.id===e)||Ge[0]}function $r(e,t){const a=typeof(t==null?void 0:t.game_id)=="string"?t.game_id:"";let i=Ge.find(r=>r.id===a);return i||(i=Ge.find(r=>r.id===e),i)?i:e==="signal_hunt"?Ge.find(r=>r.id==="shake_antenna_charge")||Ge[0]:Ge.find(r=>r.family===e&&r.category!=="physical")||Ge.find(r=>r.family===e)||Ge[0]}function Ys(e){return ui.find(t=>t.id===e)||ui[0]}function Pt(e){const t=Lr(e),a={...t.id==="sequence_code"?{}:Ks(t.family),...t.config,game_id:t.id,game_title:t.title};return{type:t.family,label:t.title,icon:Vs(t.family),objective:String(a.objective||""),content:t.content,config:a,config_summary:Object.keys(a),messages:t.messages}}function Zs(){return n.jsxs("div",{className:"admin-cms-local-panel",children:[n.jsx("strong",{children:"Juegos disponibles"}),n.jsxs("span",{children:[Ge.length," plantillas editables. Motores actuales: movimiento, QR/físico y lógica. GPS/brújula quedan solo como motores internos legacy si una misión antigua los usa."]}),n.jsx("div",{className:"admin-local-list",children:Ge.map(e=>n.jsxs("div",{className:"admin-local-row static admin-game-list-row",children:[n.jsxs("span",{children:[e.icon," ",e.title]}),n.jsxs("small",{children:[e.difficulty," · ",e.duration," · ",e.summary]})]},e.id))}),n.jsx("strong",{children:"Motores internos"}),n.jsx("span",{children:"Estos son los runtimes que ejecuta el player actualmente."}),n.jsx("div",{className:"admin-local-list",children:ba.map(e=>n.jsxs("div",{className:"admin-local-row static",children:[n.jsxs("span",{children:[e.icon," ",e.title]}),n.jsxs("small",{children:[e.id," · ",e.detail]})]},e.id))})]})}const rn=[{key:"rules",label:"1. Tipo y Reglas",icon:"🎯"},{key:"config",label:"2. Ajustes del Juego",icon:"⚙️"},{key:"content",label:"3. Historia y Pistas",icon:"📜"}],Xs=new Set(["runtime_ready"]),ed=new Set(["completion_method","game_id","game_title","objective","source_lat","source_lon","max_signal","noise_floor","jitter","decay_curve","timeout_ms","update_rate_ms","use_audio","use_vibration","use_direction_hint","false_peaks","dead_zones","seed","path_cells","pattern_mode","shuffle_choices","hint_text","max_attempts","image_data_url","image_alt","grid_size","preview_ms","max_moves","require_final_question","final_question","final_choices","final_correct_index"]),td={"GPS unavailable message.":"Activa GPS para localizar la señal.","Move closer to unlock this node.":"Acércate más al punto para desbloquear el nodo.","Complete this node to continue.":"Completa este nodo para continuar."},nd={qr_collectible:"collectible",qr_key_gate:"requirement",clue_card:"clue",bonus_cache:"bonus"},ad={collectible:"qr_collectible",requirement:"qr_key_gate",clue:"clue_card",bonus:"bonus_cache",qr:"qr_collectible"},Tr={objective:{label:"Objetivo interno",help:"Define que intenta resolver el juego. Normalmente viene de la plantilla.",type:"text"},completion_method:{label:"Cómo se completa",help:"Forma principal de cerrar el nodo en el móvil del jugador.",type:"select",options:[{value:"proximity",label:"Llegar a la zona"},{value:"hold",label:"Mantenerse en la zona"},{value:"bearing",label:"Rumbo / brújula"},{value:"puzzle",label:"Puzzle visual"},{value:"manual_code",label:"Código manual"},{value:"sequence",label:"Secuencia"},{value:"qr_complete",label:"QR completa el nodo"},{value:"photo",label:"Foto"},{value:"inventory_only",label:"Objeto/mochila"},{value:"team",label:"Equipo"},{value:"motion",label:"Movimiento / sensor"}]},source_radius_m:{label:"Radio de señal",help:"Zona aproximada donde la señal empieza a funcionar.",type:"number"},lock_threshold:{label:"Umbral de bloqueo",help:"Valor de señal o precisión necesario para dar el nodo por válido.",type:"number"},hold_ms:{label:"Tiempo de espera",help:"Milisegundos que debe mantenerse la condición antes de completar.",type:"number"},target_bearing_deg:{label:"Rumbo objetivo",help:"Dirección en grados: 0 norte, 90 este, 180 sur, 270 oeste.",type:"number"},tolerance_deg:{label:"Tolerancia de rumbo",help:"Margen permitido alrededor del rumbo objetivo.",type:"number"},grid_cols:{label:"Columnas",help:"Tamaño horizontal del puzzle lógico.",type:"number"},grid_rows:{label:"Filas",help:"Tamaño vertical del puzzle lógico.",type:"number"},difficulty:{label:"Dificultad",help:"Nivel de dificultad del reto.",type:"select",options:[{value:"easy",label:"Fácil"},{value:"normal",label:"Normal"},{value:"hard",label:"Difícil"}]},expected_code:{label:"Código esperado",help:"Palabra o código que deberá introducir el jugador.",type:"text"},sequence:{label:"Secuencia",help:"Lista de valores separados por coma.",type:"sequence"},game_id:{label:"ID de juego",help:"Identificador del catálogo. No suele hacer falta tocarlo.",type:"text"},game_title:{label:"Nombre de juego",help:"Nombre de referencia de la plantilla.",type:"text"}};function Wt(e){return e.config&&typeof e.config=="object"?e.config:{}}function id(e){return String(e.title||e.name||"NEW NODE")}function od(e){var a;return typeof e.index=="number"?String(e.index+1):((a=String(e.title||e.name||e.id||e.node_id||"").match(/\d+/))==null?void 0:a[0])||""}function rd(e){return id(e).replace(/^\d+\.\s*/,"")}function Fr(e){const t=String(e||"collectible");return t==="object"?"collectible":t==="key"?"requirement":t==="requirement"||t==="clue"||t==="bonus"||t==="collectible"?t:"collectible"}function Dr(e){const t=String(e.physical_node_kind||e.physical_item_kind||"");return!!(e.physical_qr||e.qr_payload||t==="requirement"||t==="clue"||t==="bonus"||t==="qr"||String(e.game_type||"").includes("qr_")||String(e.game_template_id||"").includes("qr_"))}function ld(e){const t=Wt(e),a=typeof t.game_id=="string"?t.game_id:"",i=typeof e.game_type=="string"?e.game_type:"",r=typeof e.game_template_id=="string"?e.game_template_id:"",o=a?Ge.find(s=>s.id===a):null,l=i?Ge.find(s=>s.id===i):null,d=r?Ge.find(s=>s.id===r):null;return l&&d&&l.id===d.id?l:o||d||l||(e.type==="signal_hunt"&&!Dr(e)?Ge.find(s=>s.id==="shake_antenna_charge")||Ge[0]:Ge.find(s=>s.family===e.type&&s.category!=="physical")||Ge.find(s=>s.family===e.type)||Ge[0])}function Fn(e){const t=Wt(e);return In(e)||e.physical_qr||e.qr_payload?!1:t.is_map_collectible||e.is_map_collectible||String(e.physical_node_kind||e.physical_item_kind||"")==="collectible"&&(e.physical_item_id||e.physical_item_label)?!0:!!t.reward_item_id}function In(e){const t=Wt(e);return String(e.game_type||"")==="simple_checkpoint"||String(e.game_template_id||"")==="simple_checkpoint"||String(t.game_id||"")==="simple_checkpoint"}function ya(e){if(Fn(e)||In(e))return!1;const t=Wt(e),a=typeof t.game_id=="string"?t.game_id:typeof e.game_type=="string"?e.game_type:typeof e.game_template_id=="string"?e.game_template_id:"",i=a?Ge.find(r=>r.id===a):null;return!!(Dr(e)||(i==null?void 0:i.category)==="physical")}function ro(e=!1){return Ge.filter(t=>t.category==="physical"||t.id==="simple_checkpoint"?!1:e?!0:Or(t))}function sd(){return Ge.filter(e=>e.category==="physical")}function Ga(e){return e.runtimeStatus==="runtime_ready"?"Jugable":e.runtimeStatus==="runtime_partial"?"Experimental":e.runtimeStatus==="preset_only"?"Plantilla":"No listo"}function Ha(e){return e.offlineStatus==="offline_ready"?"Offline listo":e.offlineStatus==="offline_partial"?"Offline parcial":"Offline pendiente"}function Or(e){return Xs.has(e.runtimeStatus)}function dd(e){return e.category==="gps"||e.category==="compass"||e.category==="photo"||e.category==="team"||e.completionMethod==="proximity"||e.completionMethod==="hold"||e.completionMethod==="bearing"}function cd(e){const t=String(e??"").trim().toLowerCase();return t==="easy"||t==="facil"||t==="fácil"||t==="1"?"easy":t==="hard"||t==="dificil"||t==="difícil"||t==="3"||t==="4"||t==="5"?"hard":"normal"}function ud(e){if(e.pattern_mode!=="fixed")return!0;if(!Array.isArray(e.path_cells)||e.path_cells.length<4)return!1;const t=Math.max(4,Math.min(6,Number(e.grid_rows||5))),a=Math.max(4,Math.min(6,Number(e.grid_cols||5))),i=new Set;let r=null;for(const o of e.path_cells){const l=String(o);if(!/^\d+:\d+$/.test(l)||i.has(l))return!1;const[d,s]=l.split(":").map(Number);if(d<0||d>=t||s<0||s>=a||r&&Math.abs(d-r[0])+Math.abs(s-r[1])!==1)return!1;i.add(l),r=[d,s]}return!0}function pd(e){if(!Array.isArray(e.sequence))return!1;const t=e.sequence.map(r=>String(r).trim());if(t.length<3||t.length>10||t.some(r=>!r||r.length>32)||new Set(t.map(r=>r.toLocaleLowerCase())).size!==t.length)return!1;const i=Number(e.max_attempts??3);return Number.isInteger(i)&&i>=1&&i<=8}function md(e){const t=Number(e.grid_rows??9),a=Number(e.grid_cols??9),i=Number(e.time_limit_s??75),r=Number(e.lives??3);return Number.isInteger(t)&&t>=5&&t<=13&&Number.isInteger(a)&&a>=5&&a<=13&&Number.isInteger(i)&&i>=20&&i<=180&&Number.isInteger(r)&&r>=1&&r<=5}function gd(e){const t=String(e.image_data_url||"").trim(),a=t.length<=6e5&&(t.startsWith("data:image/jpeg;base64,")||t.startsWith("data:image/png;base64,")||t.startsWith("data:image/webp;base64,")),i=Number(e.grid_size??e.grid_cols??3);if(!a||!Number.isInteger(i)||i<2||i>4)return!1;if(e.require_final_question!==!0)return!0;const r=String(e.final_question||"").trim(),o=Array.isArray(e.final_choices)?e.final_choices.map(d=>String(d).trim()).filter(Boolean):[],l=Number(e.final_correct_index??0);return r.length>=3&&o.length>=2&&o.length<=4&&Number.isInteger(l)&&l>=0&&l<o.length}function zi(e){return String(e||"").trim().toLocaleLowerCase()}function qi(e){const t=zi(e);return!t||/^new node(?:\s+\d+)?$/.test(t)||/^nuevo nodo(?:\s+\d+)?$/.test(t)?!0:new Set(["restaurar el circuito","matriz de circuitos","código secuencial","codigo secuencial","la clave del tríptico","la clave del triptico","mosaico del lugar","laberinto de equilibrio"]).has(t)}function fd(e){return qi(e)}function hd(e){return qi(e)}function bd(e){const t=zi(e);return t?t.includes("memoriza la secuencia")||t.includes("memoriza la ruta de energía")||t.includes("memoriza la ruta de energia")||t.includes("busca el punto marcado")||t==="ordena las fichas para reconstruir el código."||t==="ordena las fichas para reconstruir el codigo.":!0}function xd(e){const t=zi(e);return t?t.includes("memoriza la secuencia")||t.includes("recuerda el orden en el que encontraste"):!0}function yd(e){return!Or(e)}function Wa(e,t){const a=String(e||"").trim();return a?td[a]||a:t}const _d=new Set(["logic_circuit","sequence_code","place_mosaic","tilt_maze"]);function vd(e){return _d.has(e.id)}function jd(e,t){if(e.id==="sequence_code"||e.id==="place_mosaic"||e.id==="tilt_maze")return[];const a=new Set;if(e.category==="gps"||e.completionMethod==="proximity"||e.completionMethod==="hold"||e.completionMethod==="team")for(const i of["source_radius_m","lock_threshold","hold_ms"])i in t&&a.add(i);if(e.category==="compass"||e.completionMethod==="bearing")for(const i of["target_bearing_deg","tolerance_deg","hold_ms"])i in t&&a.add(i);if(e.category==="logic"||e.completionMethod==="puzzle")for(const i of["grid_cols","grid_rows","difficulty"])i in t&&a.add(i);if(e.category==="motion"||e.completionMethod==="motion")for(const i of["difficulty","time_limit_ms","stabilize_ms"])i in t&&a.add(i);if(e.completionMethod==="manual_code")for(const i of["expected_code","difficulty"])i in t&&a.add(i);if(e.completionMethod==="sequence")for(const i of["sequence","difficulty"])i in t&&a.add(i);return Array.from(a).filter(i=>!ed.has(i))}function Ln(e){return String(e||"item").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"objeto_saga"}function Yn(e){const t=Wt(e),a=String(e.fallback_code||e.physical_fallback_code||t.success_code||t.fallback_code||"");return a?a.toUpperCase():`SAGA-${(od(e)||"00").padStart(2,"0")}`}function lo(e){return nd[e.id]||Fr("collectible")}function wd(e){return Lr(ad[e])}function Kt(e){return String(e.physical_item_label||e.title||"Objeto SAGA")}function sn(e){return String(e.physical_item_id||Ln(e.id||e.node_id||Kt(e)))}function xn(e){return String(e.qr_payload||`SAGA1:ITEM:${sn(e)}:${Kt(e)}`)}function kd(e){const t=String(e.qr_card_preset||"clean"),a=String(e.qr_card_shape||"rounded"),i=String(e.qr_card_accent||"#2563eb"),r=String(e.qr_card_image_data_url||"");return{preset:t==="dark"||t==="photo"?t:"clean",shape:a==="square"?"square":"rounded",accent:/^#[0-9a-f]{6}$/i.test(i)?i:"#2563eb",imageDataUrl:r}}function so(e){return Array.isArray(e)?e.join(", "):e==null?"":String(e)}function Sd(e,t){const a=Tr[e];if((a==null?void 0:a.type)==="number"){const i=Number(t);return Number.isFinite(i)?i:0}return(a==null?void 0:a.type)==="sequence"?t.split(",").map(i=>i.trim()).filter(Boolean):t}var Cd=Object.defineProperty,_a=Object.getOwnPropertySymbols,Br=Object.prototype.hasOwnProperty,Gr=Object.prototype.propertyIsEnumerable,co=(e,t,a)=>t in e?Cd(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a,pi=(e,t)=>{for(var a in t||(t={}))Br.call(t,a)&&co(e,a,t[a]);if(_a)for(var a of _a(t))Gr.call(t,a)&&co(e,a,t[a]);return e},mi=(e,t)=>{var a={};for(var i in e)Br.call(e,i)&&t.indexOf(i)<0&&(a[i]=e[i]);if(e!=null&&_a)for(var i of _a(e))t.indexOf(i)<0&&Gr.call(e,i)&&(a[i]=e[i]);return a};/**
 * @license QR Code generator library (TypeScript)
 * Copyright (c) Project Nayuki.
 * SPDX-License-Identifier: MIT
 */var an;(e=>{const t=class he{constructor(s,c,u,p){if(this.version=s,this.errorCorrectionLevel=c,this.modules=[],this.isFunction=[],s<he.MIN_VERSION||s>he.MAX_VERSION)throw new RangeError("Version value out of range");if(p<-1||p>7)throw new RangeError("Mask value out of range");this.size=s*4+17;let m=[];for(let b=0;b<this.size;b++)m.push(!1);for(let b=0;b<this.size;b++)this.modules.push(m.slice()),this.isFunction.push(m.slice());this.drawFunctionPatterns();const y=this.addEccAndInterleave(u);if(this.drawCodewords(y),p==-1){let b=1e9;for(let w=0;w<8;w++){this.applyMask(w),this.drawFormatBits(w);const f=this.getPenaltyScore();f<b&&(p=w,b=f),this.applyMask(w)}}r(0<=p&&p<=7),this.mask=p,this.applyMask(p),this.drawFormatBits(p),this.isFunction=[]}static encodeText(s,c){const u=e.QrSegment.makeSegments(s);return he.encodeSegments(u,c)}static encodeBinary(s,c){const u=e.QrSegment.makeBytes(s);return he.encodeSegments([u],c)}static encodeSegments(s,c,u=1,p=40,m=-1,y=!0){if(!(he.MIN_VERSION<=u&&u<=p&&p<=he.MAX_VERSION)||m<-1||m>7)throw new RangeError("Invalid value");let b,w;for(b=u;;b++){const h=he.getNumDataCodewords(b,c)*8,C=l.getTotalBits(s,b);if(C<=h){w=C;break}if(b>=p)throw new RangeError("Data too long")}for(const h of[he.Ecc.MEDIUM,he.Ecc.QUARTILE,he.Ecc.HIGH])y&&w<=he.getNumDataCodewords(b,h)*8&&(c=h);let f=[];for(const h of s){a(h.mode.modeBits,4,f),a(h.numChars,h.mode.numCharCountBits(b),f);for(const C of h.getData())f.push(C)}r(f.length==w);const v=he.getNumDataCodewords(b,c)*8;r(f.length<=v),a(0,Math.min(4,v-f.length),f),a(0,(8-f.length%8)%8,f),r(f.length%8==0);for(let h=236;f.length<v;h^=253)a(h,8,f);let N=[];for(;N.length*8<f.length;)N.push(0);return f.forEach((h,C)=>N[C>>>3]|=h<<7-(C&7)),new he(b,c,N,m)}getModule(s,c){return 0<=s&&s<this.size&&0<=c&&c<this.size&&this.modules[c][s]}getModules(){return this.modules}drawFunctionPatterns(){for(let u=0;u<this.size;u++)this.setFunctionModule(6,u,u%2==0),this.setFunctionModule(u,6,u%2==0);this.drawFinderPattern(3,3),this.drawFinderPattern(this.size-4,3),this.drawFinderPattern(3,this.size-4);const s=this.getAlignmentPatternPositions(),c=s.length;for(let u=0;u<c;u++)for(let p=0;p<c;p++)u==0&&p==0||u==0&&p==c-1||u==c-1&&p==0||this.drawAlignmentPattern(s[u],s[p]);this.drawFormatBits(0),this.drawVersion()}drawFormatBits(s){const c=this.errorCorrectionLevel.formatBits<<3|s;let u=c;for(let m=0;m<10;m++)u=u<<1^(u>>>9)*1335;const p=(c<<10|u)^21522;r(p>>>15==0);for(let m=0;m<=5;m++)this.setFunctionModule(8,m,i(p,m));this.setFunctionModule(8,7,i(p,6)),this.setFunctionModule(8,8,i(p,7)),this.setFunctionModule(7,8,i(p,8));for(let m=9;m<15;m++)this.setFunctionModule(14-m,8,i(p,m));for(let m=0;m<8;m++)this.setFunctionModule(this.size-1-m,8,i(p,m));for(let m=8;m<15;m++)this.setFunctionModule(8,this.size-15+m,i(p,m));this.setFunctionModule(8,this.size-8,!0)}drawVersion(){if(this.version<7)return;let s=this.version;for(let u=0;u<12;u++)s=s<<1^(s>>>11)*7973;const c=this.version<<12|s;r(c>>>18==0);for(let u=0;u<18;u++){const p=i(c,u),m=this.size-11+u%3,y=Math.floor(u/3);this.setFunctionModule(m,y,p),this.setFunctionModule(y,m,p)}}drawFinderPattern(s,c){for(let u=-4;u<=4;u++)for(let p=-4;p<=4;p++){const m=Math.max(Math.abs(p),Math.abs(u)),y=s+p,b=c+u;0<=y&&y<this.size&&0<=b&&b<this.size&&this.setFunctionModule(y,b,m!=2&&m!=4)}}drawAlignmentPattern(s,c){for(let u=-2;u<=2;u++)for(let p=-2;p<=2;p++)this.setFunctionModule(s+p,c+u,Math.max(Math.abs(p),Math.abs(u))!=1)}setFunctionModule(s,c,u){this.modules[c][s]=u,this.isFunction[c][s]=!0}addEccAndInterleave(s){const c=this.version,u=this.errorCorrectionLevel;if(s.length!=he.getNumDataCodewords(c,u))throw new RangeError("Invalid argument");const p=he.NUM_ERROR_CORRECTION_BLOCKS[u.ordinal][c],m=he.ECC_CODEWORDS_PER_BLOCK[u.ordinal][c],y=Math.floor(he.getNumRawDataModules(c)/8),b=p-y%p,w=Math.floor(y/p);let f=[];const v=he.reedSolomonComputeDivisor(m);for(let h=0,C=0;h<p;h++){let z=s.slice(C,C+w-m+(h<b?0:1));C+=z.length;const B=he.reedSolomonComputeRemainder(z,v);h<b&&z.push(0),f.push(z.concat(B))}let N=[];for(let h=0;h<f[0].length;h++)f.forEach((C,z)=>{(h!=w-m||z>=b)&&N.push(C[h])});return r(N.length==y),N}drawCodewords(s){if(s.length!=Math.floor(he.getNumRawDataModules(this.version)/8))throw new RangeError("Invalid argument");let c=0;for(let u=this.size-1;u>=1;u-=2){u==6&&(u=5);for(let p=0;p<this.size;p++)for(let m=0;m<2;m++){const y=u-m,w=(u+1&2)==0?this.size-1-p:p;!this.isFunction[w][y]&&c<s.length*8&&(this.modules[w][y]=i(s[c>>>3],7-(c&7)),c++)}}r(c==s.length*8)}applyMask(s){if(s<0||s>7)throw new RangeError("Mask value out of range");for(let c=0;c<this.size;c++)for(let u=0;u<this.size;u++){let p;switch(s){case 0:p=(u+c)%2==0;break;case 1:p=c%2==0;break;case 2:p=u%3==0;break;case 3:p=(u+c)%3==0;break;case 4:p=(Math.floor(u/3)+Math.floor(c/2))%2==0;break;case 5:p=u*c%2+u*c%3==0;break;case 6:p=(u*c%2+u*c%3)%2==0;break;case 7:p=((u+c)%2+u*c%3)%2==0;break;default:throw new Error("Unreachable")}!this.isFunction[c][u]&&p&&(this.modules[c][u]=!this.modules[c][u])}}getPenaltyScore(){let s=0;for(let m=0;m<this.size;m++){let y=!1,b=0,w=[0,0,0,0,0,0,0];for(let f=0;f<this.size;f++)this.modules[m][f]==y?(b++,b==5?s+=he.PENALTY_N1:b>5&&s++):(this.finderPenaltyAddHistory(b,w),y||(s+=this.finderPenaltyCountPatterns(w)*he.PENALTY_N3),y=this.modules[m][f],b=1);s+=this.finderPenaltyTerminateAndCount(y,b,w)*he.PENALTY_N3}for(let m=0;m<this.size;m++){let y=!1,b=0,w=[0,0,0,0,0,0,0];for(let f=0;f<this.size;f++)this.modules[f][m]==y?(b++,b==5?s+=he.PENALTY_N1:b>5&&s++):(this.finderPenaltyAddHistory(b,w),y||(s+=this.finderPenaltyCountPatterns(w)*he.PENALTY_N3),y=this.modules[f][m],b=1);s+=this.finderPenaltyTerminateAndCount(y,b,w)*he.PENALTY_N3}for(let m=0;m<this.size-1;m++)for(let y=0;y<this.size-1;y++){const b=this.modules[m][y];b==this.modules[m][y+1]&&b==this.modules[m+1][y]&&b==this.modules[m+1][y+1]&&(s+=he.PENALTY_N2)}let c=0;for(const m of this.modules)c=m.reduce((y,b)=>y+(b?1:0),c);const u=this.size*this.size,p=Math.ceil(Math.abs(c*20-u*10)/u)-1;return r(0<=p&&p<=9),s+=p*he.PENALTY_N4,r(0<=s&&s<=2568888),s}getAlignmentPatternPositions(){if(this.version==1)return[];{const s=Math.floor(this.version/7)+2,c=this.version==32?26:Math.ceil((this.version*4+4)/(s*2-2))*2;let u=[6];for(let p=this.size-7;u.length<s;p-=c)u.splice(1,0,p);return u}}static getNumRawDataModules(s){if(s<he.MIN_VERSION||s>he.MAX_VERSION)throw new RangeError("Version number out of range");let c=(16*s+128)*s+64;if(s>=2){const u=Math.floor(s/7)+2;c-=(25*u-10)*u-55,s>=7&&(c-=36)}return r(208<=c&&c<=29648),c}static getNumDataCodewords(s,c){return Math.floor(he.getNumRawDataModules(s)/8)-he.ECC_CODEWORDS_PER_BLOCK[c.ordinal][s]*he.NUM_ERROR_CORRECTION_BLOCKS[c.ordinal][s]}static reedSolomonComputeDivisor(s){if(s<1||s>255)throw new RangeError("Degree out of range");let c=[];for(let p=0;p<s-1;p++)c.push(0);c.push(1);let u=1;for(let p=0;p<s;p++){for(let m=0;m<c.length;m++)c[m]=he.reedSolomonMultiply(c[m],u),m+1<c.length&&(c[m]^=c[m+1]);u=he.reedSolomonMultiply(u,2)}return c}static reedSolomonComputeRemainder(s,c){let u=c.map(p=>0);for(const p of s){const m=p^u.shift();u.push(0),c.forEach((y,b)=>u[b]^=he.reedSolomonMultiply(y,m))}return u}static reedSolomonMultiply(s,c){if(s>>>8||c>>>8)throw new RangeError("Byte out of range");let u=0;for(let p=7;p>=0;p--)u=u<<1^(u>>>7)*285,u^=(c>>>p&1)*s;return r(u>>>8==0),u}finderPenaltyCountPatterns(s){const c=s[1];r(c<=this.size*3);const u=c>0&&s[2]==c&&s[3]==c*3&&s[4]==c&&s[5]==c;return(u&&s[0]>=c*4&&s[6]>=c?1:0)+(u&&s[6]>=c*4&&s[0]>=c?1:0)}finderPenaltyTerminateAndCount(s,c,u){return s&&(this.finderPenaltyAddHistory(c,u),c=0),c+=this.size,this.finderPenaltyAddHistory(c,u),this.finderPenaltyCountPatterns(u)}finderPenaltyAddHistory(s,c){c[0]==0&&(s+=this.size),c.pop(),c.unshift(s)}};t.MIN_VERSION=1,t.MAX_VERSION=40,t.PENALTY_N1=3,t.PENALTY_N2=3,t.PENALTY_N3=40,t.PENALTY_N4=10,t.ECC_CODEWORDS_PER_BLOCK=[[-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],[-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],[-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]],t.NUM_ERROR_CORRECTION_BLOCKS=[[-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],[-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],[-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]],e.QrCode=t;function a(d,s,c){if(s<0||s>31||d>>>s)throw new RangeError("Value out of range");for(let u=s-1;u>=0;u--)c.push(d>>>u&1)}function i(d,s){return(d>>>s&1)!=0}function r(d){if(!d)throw new Error("Assertion error")}const o=class Ve{constructor(s,c,u){if(this.mode=s,this.numChars=c,this.bitData=u,c<0)throw new RangeError("Invalid argument");this.bitData=u.slice()}static makeBytes(s){let c=[];for(const u of s)a(u,8,c);return new Ve(Ve.Mode.BYTE,s.length,c)}static makeNumeric(s){if(!Ve.isNumeric(s))throw new RangeError("String contains non-numeric characters");let c=[];for(let u=0;u<s.length;){const p=Math.min(s.length-u,3);a(parseInt(s.substring(u,u+p),10),p*3+1,c),u+=p}return new Ve(Ve.Mode.NUMERIC,s.length,c)}static makeAlphanumeric(s){if(!Ve.isAlphanumeric(s))throw new RangeError("String contains unencodable characters in alphanumeric mode");let c=[],u;for(u=0;u+2<=s.length;u+=2){let p=Ve.ALPHANUMERIC_CHARSET.indexOf(s.charAt(u))*45;p+=Ve.ALPHANUMERIC_CHARSET.indexOf(s.charAt(u+1)),a(p,11,c)}return u<s.length&&a(Ve.ALPHANUMERIC_CHARSET.indexOf(s.charAt(u)),6,c),new Ve(Ve.Mode.ALPHANUMERIC,s.length,c)}static makeSegments(s){return s==""?[]:Ve.isNumeric(s)?[Ve.makeNumeric(s)]:Ve.isAlphanumeric(s)?[Ve.makeAlphanumeric(s)]:[Ve.makeBytes(Ve.toUtf8ByteArray(s))]}static makeEci(s){let c=[];if(s<0)throw new RangeError("ECI assignment value out of range");if(s<128)a(s,8,c);else if(s<16384)a(2,2,c),a(s,14,c);else if(s<1e6)a(6,3,c),a(s,21,c);else throw new RangeError("ECI assignment value out of range");return new Ve(Ve.Mode.ECI,0,c)}static isNumeric(s){return Ve.NUMERIC_REGEX.test(s)}static isAlphanumeric(s){return Ve.ALPHANUMERIC_REGEX.test(s)}getData(){return this.bitData.slice()}static getTotalBits(s,c){let u=0;for(const p of s){const m=p.mode.numCharCountBits(c);if(p.numChars>=1<<m)return 1/0;u+=4+m+p.bitData.length}return u}static toUtf8ByteArray(s){s=encodeURI(s);let c=[];for(let u=0;u<s.length;u++)s.charAt(u)!="%"?c.push(s.charCodeAt(u)):(c.push(parseInt(s.substring(u+1,u+3),16)),u+=2);return c}};o.NUMERIC_REGEX=/^[0-9]*$/,o.ALPHANUMERIC_REGEX=/^[A-Z0-9 $%*+.\/:-]*$/,o.ALPHANUMERIC_CHARSET="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";let l=o;e.QrSegment=o})(an||(an={}));(e=>{(t=>{const a=class{constructor(r,o){this.ordinal=r,this.formatBits=o}};a.LOW=new a(0,1),a.MEDIUM=new a(1,0),a.QUARTILE=new a(2,3),a.HIGH=new a(3,2),t.Ecc=a})(e.QrCode||(e.QrCode={}))})(an||(an={}));(e=>{(t=>{const a=class{constructor(r,o){this.modeBits=r,this.numBitsCharCount=o}numCharCountBits(r){return this.numBitsCharCount[Math.floor((r+7)/17)]}};a.NUMERIC=new a(1,[10,12,14]),a.ALPHANUMERIC=new a(2,[9,11,13]),a.BYTE=new a(4,[8,16,16]),a.KANJI=new a(8,[8,10,12]),a.ECI=new a(7,[0,0,0]),t.Mode=a})(e.QrSegment||(e.QrSegment={}))})(an||(an={}));var cn=an;/**
 * @license qrcode.react
 * Copyright (c) Paul O'Shannessy
 * SPDX-License-Identifier: ISC
 */var Nd={L:cn.QrCode.Ecc.LOW,M:cn.QrCode.Ecc.MEDIUM,Q:cn.QrCode.Ecc.QUARTILE,H:cn.QrCode.Ecc.HIGH},Hr=128,Wr="L",Qr="#FFFFFF",Vr="#000000",Ur=!1,Kr=1,Ed=4,Rd=0,Md=.1;function Jr(e,t=0){const a=[];return e.forEach(function(i,r){let o=null;i.forEach(function(l,d){if(!l&&o!==null){a.push(`M${o+t} ${r+t}h${d-o}v1H${o+t}z`),o=null;return}if(d===i.length-1){if(!l)return;o===null?a.push(`M${d+t},${r+t} h1v1H${d+t}z`):a.push(`M${o+t},${r+t} h${d+1-o}v1H${o+t}z`);return}l&&o===null&&(o=d)})}),a.join("")}function Yr(e,t){return e.slice().map((a,i)=>i<t.y||i>=t.y+t.h?a:a.map((r,o)=>o<t.x||o>=t.x+t.w?r:!1))}function zd(e,t,a,i){if(i==null)return null;const r=e.length+a*2,o=Math.floor(t*Md),l=r/t,d=(i.width||o)*l,s=(i.height||o)*l,c=i.x==null?e.length/2-d/2:i.x*l,u=i.y==null?e.length/2-s/2:i.y*l,p=i.opacity==null?1:i.opacity;let m=null;if(i.excavate){let b=Math.floor(c),w=Math.floor(u),f=Math.ceil(d+c-b),v=Math.ceil(s+u-w);m={x:b,y:w,w:f,h:v}}const y=i.crossOrigin;return{x:c,y:u,h:s,w:d,excavation:m,opacity:p,crossOrigin:y}}function qd(e,t){return t!=null?Math.max(Math.floor(t),0):e?Ed:Rd}function Zr({value:e,level:t,minVersion:a,includeMargin:i,marginSize:r,imageSettings:o,size:l,boostLevel:d}){let s=Ze.useMemo(()=>{const b=(Array.isArray(e)?e:[e]).reduce((w,f)=>(w.push(...cn.QrSegment.makeSegments(f)),w),[]);return cn.QrCode.encodeSegments(b,Nd[t],a,void 0,void 0,d)},[e,t,a,d]);const{cells:c,margin:u,numCells:p,calculatedImageSettings:m}=Ze.useMemo(()=>{let y=s.getModules();const b=qd(i,r),w=y.length+b*2,f=zd(y,l,b,o);return{cells:y,margin:b,numCells:w,calculatedImageSettings:f}},[s,l,o,i,r]);return{qrcode:s,margin:u,cells:c,numCells:p,calculatedImageSettings:m}}var Ad=function(){try{new Path2D().addPath(new Path2D)}catch{return!1}return!0}(),Pd=Ze.forwardRef(function(t,a){const i=t,{value:r,size:o=Hr,level:l=Wr,bgColor:d=Qr,fgColor:s=Vr,includeMargin:c=Ur,minVersion:u=Kr,boostLevel:p,marginSize:m,imageSettings:y}=i,w=mi(i,["value","size","level","bgColor","fgColor","includeMargin","minVersion","boostLevel","marginSize","imageSettings"]),{style:f}=w,v=mi(w,["style"]),N=y==null?void 0:y.src,h=Ze.useRef(null),C=Ze.useRef(null),z=Ze.useCallback(Fe=>{h.current=Fe,typeof a=="function"?a(Fe):a&&(a.current=Fe)},[a]),[B,U]=Ze.useState(!1),{margin:ee,cells:_e,numCells:pe,calculatedImageSettings:ke}=Zr({value:r,level:l,minVersion:u,boostLevel:p,includeMargin:c,marginSize:m,imageSettings:y,size:o});Ze.useEffect(()=>{if(h.current!=null){const Fe=h.current,K=Fe.getContext("2d");if(!K)return;let we=_e;const qe=C.current,He=ke!=null&&qe!==null&&qe.complete&&qe.naturalHeight!==0&&qe.naturalWidth!==0;He&&ke.excavation!=null&&(we=Yr(_e,ke.excavation));const Ue=window.devicePixelRatio||1;Fe.height=Fe.width=o*Ue;const de=o/pe*Ue;K.scale(de,de),K.fillStyle=d,K.fillRect(0,0,pe,pe),K.fillStyle=s,Ad?K.fill(new Path2D(Jr(we,ee))):_e.forEach(function(De,Se){De.forEach(function(Xe,Oe){Xe&&K.fillRect(Oe+ee,Se+ee,1,1)})}),ke&&(K.globalAlpha=ke.opacity),He&&K.drawImage(qe,ke.x+ee,ke.y+ee,ke.w,ke.h)}}),Ze.useEffect(()=>{U(!1)},[N]);const je=pi({height:o,width:o},f);let mt=null;return N!=null&&(mt=Ze.createElement("img",{src:N,key:N,style:{display:"none"},onLoad:()=>{U(!0)},ref:C,crossOrigin:ke==null?void 0:ke.crossOrigin})),Ze.createElement(Ze.Fragment,null,Ze.createElement("canvas",pi({style:je,height:o,width:o,ref:z,role:"img"},v)),mt)});Pd.displayName="QRCodeCanvas";var Xr=Ze.forwardRef(function(t,a){const i=t,{value:r,size:o=Hr,level:l=Wr,bgColor:d=Qr,fgColor:s=Vr,includeMargin:c=Ur,minVersion:u=Kr,boostLevel:p,title:m,marginSize:y,imageSettings:b}=i,w=mi(i,["value","size","level","bgColor","fgColor","includeMargin","minVersion","boostLevel","title","marginSize","imageSettings"]),{margin:f,cells:v,numCells:N,calculatedImageSettings:h}=Zr({value:r,level:l,minVersion:u,boostLevel:p,includeMargin:c,marginSize:y,imageSettings:b,size:o});let C=v,z=null;b!=null&&h!=null&&(h.excavation!=null&&(C=Yr(v,h.excavation)),z=Ze.createElement("image",{href:b.src,height:h.h,width:h.w,x:h.x+f,y:h.y+f,preserveAspectRatio:"none",opacity:h.opacity,crossOrigin:h.crossOrigin}));const B=Jr(C,f);return Ze.createElement("svg",pi({height:o,width:o,viewBox:`0 0 ${N} ${N}`,ref:a,role:"img"},w),!!m&&Ze.createElement("title",null,m),Ze.createElement("path",{fill:d,d:`M0,0 h${N}v${N}H0z`,shapeRendering:"crispEdges"}),Ze.createElement("path",{fill:s,d:B,shapeRendering:"crispEdges"}),z)});Xr.displayName="QRCodeSVG";const Id=4,Ld=38;function Ai({payload:e,size:t=160,title:a,estirar:i=!1}){return n.jsx(Xr,{value:e,size:t,level:"H",marginSize:Id,bgColor:"#ffffff",fgColor:"#000000",title:a||`Código SAGA ${e}`,style:i?{width:"100%",height:"100%",display:"block"}:void 0})}function el({data:e,paraImprimir:t=!1}){const a=t?`${Ld}mm`:"160px";return n.jsxs("div",{className:"saga-qr-card",style:{display:"flex",flexDirection:"column",alignItems:"center",gap:t?"2mm":"10px",padding:t?"4mm":"14px",background:"#ffffff",color:"#000000",border:"1px solid #000000",borderRadius:t?"2mm":"10px",width:"fit-content",breakInside:"avoid"},children:[n.jsx("div",{style:{fontFamily:"system-ui, Arial, sans-serif",fontWeight:800,fontSize:t?"3mm":"11px",letterSpacing:"0.22em",color:"#00713f"},children:"SAGA"}),n.jsx("div",{style:{width:a,height:a},children:n.jsx(Ai,{payload:e.payload,size:512,title:e.label,estirar:!0})}),n.jsx("div",{style:{fontFamily:"system-ui, Arial, sans-serif",fontWeight:700,fontSize:t?"3.4mm":"13px",textAlign:"center",maxWidth:a,overflowWrap:"anywhere"},children:e.label}),n.jsx("div",{style:{fontFamily:"ui-monospace, Consolas, monospace",fontSize:t?"3mm":"12px",letterSpacing:"0.1em",color:"#333333"},children:e.payload})]})}const $d=[{id:"clean",label:"Claro",help:"Limpio y fácil de imprimir."},{id:"dark",label:"Oscuro",help:"Más contraste en pantalla."},{id:"photo",label:"Foto",help:"Imagen de cabecera sin tocar el QR."}];function Td(e){let t=2166136261;for(let a=0;a<e.length;a+=1)t^=e.charCodeAt(a),t=Math.imul(t,16777619);return(t>>>0).toString(16).padStart(8,"0")}function tl(e,t){return Td(JSON.stringify({payload:e,design:t}))}function Fd(e){return/^#[0-9a-f]{6}$/i.test(e)?e:"#2563eb"}async function Dd(e){const t=await new Promise((u,p)=>{const m=new FileReader;m.onload=()=>u(String(m.result||"")),m.onerror=()=>p(new Error("No se pudo leer la imagen")),m.readAsDataURL(e)}),a=await new Promise((u,p)=>{const m=new Image;m.onload=()=>u(m),m.onerror=()=>p(new Error("La imagen no es válida")),m.src=t}),o=Math.min(1,1e3/a.width,650/a.height),l=Math.max(1,Math.round(a.width*o)),d=Math.max(1,Math.round(a.height*o)),s=document.createElement("canvas");s.width=l,s.height=d;const c=s.getContext("2d");if(!c)throw new Error("No se pudo preparar la imagen");return c.drawImage(a,0,0,l,d),s.toDataURL("image/jpeg",.82)}function Qa(e){e==null||e.getTracks().forEach(t=>t.stop())}function Od(e,t,a,i,r,o,l){const d=t.trim().split(/\s+/).filter(Boolean),s=[];let c="";for(const u of d){const p=c?`${c} ${u}`:u;if(e.measureText(p).width<=r||!c){c=p;continue}if(s.push(c),c=u,s.length>=l-1)break}c&&s.length<l&&s.push(c),s.forEach((u,p)=>e.fillText(u,a,i+p*o))}function Bd({payload:e,label:t,itemId:a,typeLabel:i,design:r,validationSignature:o="",onDesignChange:l,onValidated:d,onApply:s}){const c=S.useRef(null),u=S.useRef(null),p=S.useRef(null),m=S.useRef(null),y=S.useRef(null),[b,w]=S.useState(!1),[f,v]=S.useState("idle"),[N,h]=S.useState(""),[C,z]=S.useState(""),B=Fd(r.accent),U=S.useMemo(()=>tl(e,{...r,accent:B}),[e,r,B]),ee=!!(o&&o===U),_e=S.useMemo(()=>{const K=r.preset==="dark",we=r.preset==="photo"&&!!r.imageDataUrl;return{...Jd,borderRadius:r.shape==="square"?8:26,color:K||we?"#ffffff":"#0f172a",background:we?`linear-gradient(180deg, rgba(15,23,42,.20), rgba(15,23,42,.94)), url(${r.imageDataUrl}) center/cover`:K?"linear-gradient(145deg, #111827, #0f172a)":"linear-gradient(145deg, #ffffff, #f8fafc)",border:`2px solid ${B}`}},[r,B]);S.useEffect(()=>()=>{y.current!==null&&cancelAnimationFrame(y.current),Qa(m.current)},[]);function pe(K){l({...r,...K}),z("El diseño cambió: valida otra vez antes de descargar.")}async function ke(K){if(K)try{const we=await Dd(K);pe({preset:"photo",imageDataUrl:we})}catch(we){z(we instanceof Error?we.message:"No se pudo preparar la imagen")}}function je(){y.current!==null&&(cancelAnimationFrame(y.current),y.current=null),Qa(m.current),m.current=null,u.current&&(u.current.srcObject=null),w(!1),v("idle")}async function mt(){var K;if(w(!0),v("starting"),h("Abriendo cámara…"),!window.isSecureContext||!((K=navigator.mediaDevices)!=null&&K.getUserMedia)){v("error"),h("La cámara necesita HTTPS y permisos del navegador.");return}try{const we=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:!1});m.current=we;const qe=u.current;if(!qe)throw new Error("No se pudo abrir la vista de cámara");qe.srcObject=we,await qe.play(),v("scanning"),h("Apunta al QR que quieres comprobar.");const He=()=>{const Ue=p.current,de=u.current;if(!Ue||!de||de.readyState<2){y.current=requestAnimationFrame(He);return}const De=de.videoWidth,Se=de.videoHeight;if(!De||!Se){y.current=requestAnimationFrame(He);return}Ue.width=De,Ue.height=Se;const Xe=Ue.getContext("2d",{willReadFrequently:!0});if(!Xe)return;Xe.drawImage(de,0,0,De,Se);const Oe=Xe.getImageData(0,0,De,Se);ps(Oe).then(te=>{if((te==null?void 0:te.texto)===e){d(U),v("valid"),h("QR correcto. Ya puedes descargar la tarjeta."),Qa(m.current),m.current=null;return}te!=null&&te.texto&&(v("wrong"),h("Ese QR no corresponde a este nodo. Prueba de nuevo.")),y.current=requestAnimationFrame(He)}).catch(()=>{y.current=requestAnimationFrame(He)})};y.current=requestAnimationFrame(He)}catch(we){v("error"),h(we instanceof Error?we.message:"No se pudo abrir la cámara")}}async function Fe(){var we;if(!ee){z("Valida el QR con la cámara antes de descargarlo.");return}const K=(we=c.current)==null?void 0:we.querySelector("svg");if(!K){z("No se encontró el QR para descargar.");return}try{const Ue=document.createElement("canvas");Ue.width=1200,Ue.height=1750;const de=Ue.getContext("2d");if(!de)throw new Error("No se pudo preparar la tarjeta");const De=r.preset==="dark",Se=r.preset==="photo"&&!!r.imageDataUrl;if(de.fillStyle=De||Se?"#0f172a":"#ffffff",de.fillRect(0,0,1200,1750),Se){const x=await new Promise((Ce,Ne)=>{const Be=new Image;Be.onload=()=>Ce(Be),Be.onerror=()=>Ne(new Error("No se pudo cargar la foto")),Be.src=r.imageDataUrl}),A=Math.max(1200/x.width,460/x.height),T=x.width*A,Z=x.height*A;de.drawImage(x,(1200-T)/2,(460-Z)/2,T,Z);const ce=de.createLinearGradient(0,0,0,500);ce.addColorStop(0,"rgba(15,23,42,.08)"),ce.addColorStop(1,"rgba(15,23,42,.94)"),de.fillStyle=ce,de.fillRect(0,0,1200,500)}de.fillStyle=B,de.fillRect(0,0,1200,34);const Xe=new XMLSerializer().serializeToString(K),Oe=new Blob([Xe],{type:"image/svg+xml;charset=utf-8"}),te=URL.createObjectURL(Oe),lt=await new Promise((x,A)=>{const T=new Image;T.onload=()=>x(T),T.onerror=()=>A(new Error("No se pudo generar el QR")),T.src=te}),Ye=820,Ke=(1200-Ye)/2,tt=Se?470:180;de.fillStyle="#ffffff",de.fillRect(Ke-36,tt-36,Ye+72,Ye+72),de.drawImage(lt,Ke,tt,Ye,Ye),URL.revokeObjectURL(te);const gt=De||Se?"#ffffff":"#0f172a";de.fillStyle=gt,de.textAlign="center",de.font="900 64px system-ui, sans-serif",Od(de,t||"Objeto SAGA",1200/2,tt+Ye+125,980,72,2),de.font="800 32px system-ui, sans-serif",de.fillStyle=De||r.preset==="photo"?"#cbd5e1":"#475569",de.fillText(i,1200/2,tt+Ye+280),de.font="700 25px ui-monospace, monospace",de.fillText(a,1200/2,tt+Ye+335);const Et=await new Promise(x=>Ue.toBlob(x,"image/png",.96));if(!Et)throw new Error("No se pudo crear el PNG");const me=URL.createObjectURL(Et),g=document.createElement("a");g.href=me,g.download=`saga-qr-${a}.png`,document.body.appendChild(g),g.click(),g.remove(),URL.revokeObjectURL(me),z("Tarjeta QR descargada.")}catch(qe){z(qe instanceof Error?qe.message:"No se pudo descargar la tarjeta")}}return n.jsxs("section",{style:Gd,"aria-label":"Diseño y validación de tarjeta QR",children:[n.jsxs("div",{style:Hd,children:[n.jsxs("div",{children:[n.jsx("span",{style:uo,children:"DISEÑO Y PRUEBA"}),n.jsx("h3",{style:Wd,children:"Tarjeta QR"}),n.jsx("p",{style:Qd,children:"El diseño rodea al QR; el código mantiene fondo blanco y alto contraste."})]}),n.jsx("span",{style:ee?Vd:Ud,children:ee?"VALIDADO":"SIN VALIDAR"})]}),n.jsxs("div",{style:Kd,children:[n.jsxs("div",{style:_e,children:[r.preset==="photo"&&r.imageDataUrl?n.jsx("div",{style:Yd}):null,n.jsx("div",{ref:c,style:Zd,children:n.jsx(Ai,{payload:e,size:184})}),n.jsx("strong",{style:Xd,children:t||"Objeto SAGA"}),n.jsx("span",{style:ec,children:i}),n.jsx("small",{style:tc,children:a})]}),n.jsxs("div",{style:nc,children:[n.jsx("div",{style:ac,children:$d.map(K=>n.jsxs("button",{type:"button",style:r.preset===K.id?ic:al,onClick:()=>pe({preset:K.id}),children:[n.jsx("strong",{children:K.label}),n.jsx("small",{children:K.help})]},K.id))}),n.jsxs("div",{style:oc,children:[n.jsxs("label",{style:po,children:["Color",n.jsx("input",{type:"color",value:B,onChange:K=>pe({accent:K.target.value}),style:rc})]}),n.jsxs("label",{style:po,children:["Forma",n.jsxs("select",{value:r.shape,onChange:K=>pe({shape:K.target.value}),style:lc,children:[n.jsx("option",{value:"rounded",children:"Redondeada"}),n.jsx("option",{value:"square",children:"Recta"})]})]})]}),n.jsxs("label",{style:sc,children:[r.imageDataUrl?"Cambiar fotografía":"Añadir fotografía",n.jsx("input",{type:"file",accept:"image/jpeg,image/png,image/webp",hidden:!0,onChange:K=>{var we;return void ke(((we=K.target.files)==null?void 0:we[0])||null)}})]}),r.imageDataUrl?n.jsx("button",{type:"button",style:mo,onClick:()=>pe({imageDataUrl:"",preset:"clean"}),children:"Quitar fotografía"}):null]})]}),n.jsxs("div",{style:uc,children:[n.jsx("button",{type:"button",style:mo,onClick:s,children:"Aplicar al nodo"}),n.jsx("button",{type:"button",style:dc,onClick:()=>void mt(),children:"Validar con cámara"}),n.jsx("button",{type:"button",style:ee?go:cc,disabled:!ee,onClick:()=>void Fe(),children:"Descargar PNG"})]}),n.jsx("p",{style:pc,children:"Abre la cámara en el móvil o en un equipo con webcam y escanea la vista previa desde otra pantalla o desde una prueba impresa."}),C?n.jsx("div",{style:mc,children:C}):null,b?n.jsxs("div",{style:gc,role:"dialog","aria-modal":"true","aria-label":"Validar QR con cámara",children:[n.jsx("div",{style:fc,onClick:je}),n.jsxs("section",{style:hc,children:[n.jsxs("div",{style:bc,children:[n.jsxs("div",{children:[n.jsx("span",{style:uo,children:"VALIDACIÓN"}),n.jsx("strong",{children:"Escanea esta tarjeta"})]}),n.jsx("button",{type:"button",style:xc,onClick:je,children:"×"})]}),n.jsx("video",{ref:u,muted:!0,playsInline:!0,style:yc}),n.jsx("canvas",{ref:p,hidden:!0}),n.jsx("div",{style:f==="valid"?_c:il,children:N}),f==="valid"?n.jsx("button",{type:"button",style:go,onClick:je,children:"Cerrar"}):null]})]}):null]})}const Gd={display:"grid",gap:14,padding:16,borderRadius:24,border:"1px solid rgba(148,163,184,.18)",background:"rgba(15,23,42,.34)"},Hd={display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12},uo={color:"#93c5fd",fontSize:9,fontWeight:950,letterSpacing:".16em"},Wd={margin:"4px 0 0",color:"#fff",fontSize:20,fontWeight:950},Qd={margin:"6px 0 0",color:"rgba(226,232,240,.72)",fontSize:12,lineHeight:1.4},nl={minHeight:26,display:"inline-flex",alignItems:"center",padding:"0 9px",borderRadius:999,fontSize:9,fontWeight:950},Vd={...nl,color:"#dcfce7",background:"rgba(34,197,94,.15)",border:"1px solid rgba(74,222,128,.22)"},Ud={...nl,color:"#fef3c7",background:"rgba(245,158,11,.14)",border:"1px solid rgba(251,191,36,.20)"},Kd={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,alignItems:"stretch"},Jd={position:"relative",minHeight:390,display:"grid",placeItems:"center",alignContent:"center",gap:8,padding:18,overflow:"hidden",textAlign:"center",boxShadow:"0 18px 42px rgba(2,6,23,.24)"},Yd={position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(15,23,42,.08),rgba(15,23,42,.80))"},Zd={position:"relative",zIndex:1,width:204,height:204,display:"grid",placeItems:"center",background:"#fff",borderRadius:18,boxShadow:"0 10px 28px rgba(2,6,23,.26)"},Xd={position:"relative",zIndex:1,fontSize:19,fontWeight:950},ec={position:"relative",zIndex:1,fontSize:12,fontWeight:850,opacity:.82},tc={position:"relative",zIndex:1,fontFamily:"ui-monospace,monospace",opacity:.68},nc={display:"grid",gap:10,alignContent:"start"},ac={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8},al={minHeight:68,display:"grid",gap:4,padding:10,borderRadius:16,border:"1px solid rgba(148,163,184,.15)",background:"rgba(30,41,59,.62)",color:"#e2e8f0",textAlign:"left"},ic={...al,border:"1px solid rgba(96,165,250,.38)",background:"rgba(37,99,235,.22)",color:"#fff"},oc={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8},po={display:"grid",gap:6,color:"rgba(226,232,240,.78)",fontSize:10,fontWeight:900,letterSpacing:".08em",textTransform:"uppercase"},rc={width:"100%",minHeight:42,padding:4,borderRadius:14,border:"1px solid rgba(148,163,184,.18)",background:"rgba(15,23,42,.56)"},lc={width:"100%",minHeight:42,padding:"0 10px",borderRadius:14,border:"1px solid rgba(148,163,184,.18)",background:"rgba(15,23,42,.56)",color:"#fff"},Hn={minHeight:42,borderRadius:15,fontSize:11,fontWeight:950},sc={...Hn,display:"grid",placeItems:"center",border:"1px dashed rgba(147,197,253,.34)",background:"rgba(37,99,235,.12)",color:"#dbeafe",cursor:"pointer"},mo={...Hn,border:"1px solid rgba(148,163,184,.18)",background:"rgba(51,65,85,.70)",color:"#f8fafc"},dc={...Hn,border:"1px solid rgba(96,165,250,.30)",background:"rgba(37,99,235,.24)",color:"#dbeafe"},go={...Hn,border:"1px solid rgba(74,222,128,.28)",background:"linear-gradient(180deg,#22c55e,#16a34a)",color:"#fff"},cc={...Hn,border:"1px solid rgba(148,163,184,.12)",background:"rgba(71,85,105,.48)",color:"rgba(226,232,240,.48)"},uc={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8},pc={margin:0,color:"rgba(148,163,184,.80)",fontSize:11,lineHeight:1.4},mc={padding:"9px 11px",borderRadius:13,background:"rgba(59,130,246,.13)",color:"#dbeafe",fontSize:11,fontWeight:850},gc={position:"fixed",inset:0,zIndex:7200,display:"grid",placeItems:"center",padding:16},fc={position:"absolute",inset:0,background:"rgba(2,6,23,.76)",backdropFilter:"blur(8px)"},hc={position:"relative",zIndex:1,width:"min(100%,520px)",display:"grid",gap:12,padding:14,borderRadius:24,border:"1px solid rgba(148,163,184,.22)",background:"#0f172a",boxShadow:"0 30px 90px rgba(2,6,23,.65)"},bc={display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,color:"#fff"},xc={width:40,height:40,borderRadius:999,border:"1px solid rgba(255,255,255,.16)",background:"rgba(30,41,59,.82)",color:"#fff",fontSize:22},yc={width:"100%",maxHeight:"58vh",objectFit:"cover",borderRadius:18,background:"#020617"},il={padding:10,borderRadius:14,background:"rgba(59,130,246,.13)",color:"#dbeafe",fontSize:12,fontWeight:850},_c={...il,background:"rgba(34,197,94,.14)",color:"#dcfce7"},vc=`
.cpe,
.cpe * {
  box-sizing: border-box !important;
}

.cpe {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  display: grid !important;
  gap: 9px !important;
  padding: 11px !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,.09) !important;
  border-radius: 16px !important;
  background: #151719 !important;
}

.cpe > div:first-child {
  min-width: 0 !important;
}

.cpe h4 {
  margin: 0 !important;
  color: #f4f4f5 !important;
  font-size: 15px !important;
  line-height: 1.1 !important;
}

.cpe p {
  margin: 3px 0 0 !important;
  color: rgba(244,244,245,.58) !important;
  font-size: 11px !important;
  line-height: 1.25 !important;
}

.cpe-modes {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0,1fr)) !important;
  gap: 7px !important;
}

.cpe-mode {
  min-width: 0 !important;
  min-height: 58px !important;
  padding: 8px 9px !important;
  border: 1px solid rgba(255,255,255,.10) !important;
  border-radius: 12px !important;
  background: #23262a !important;
  color: #f4f4f5 !important;
  text-align: left !important;
  cursor: pointer !important;
}

.cpe-mode.active {
  border-color: #68df8a !important;
  background: #203b29 !important;
}

.cpe-mode b,
.cpe-mode small {
  display: block !important;
}

.cpe-mode b {
  font-size: 12px !important;
  line-height: 1.15 !important;
}

.cpe-mode small {
  margin-top: 3px !important;
  color: rgba(244,244,245,.56) !important;
  font-size: 10px !important;
  line-height: 1.2 !important;
}

.cpe-tools {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
}

.cpe-tools button {
  min-height: 32px !important;
  padding: 6px 9px !important;
  border: 1px solid rgba(255,255,255,.10) !important;
  border-radius: 10px !important;
  background: #292d31 !important;
  color: #f4f4f5 !important;
  font-size: 11px !important;
  font-weight: 850 !important;
  cursor: pointer !important;
}

.cpe-tools .primary {
  border-color: transparent !important;
  background: #68df8a !important;
  color: #102416 !important;
}

.cpe-tools button:disabled {
  opacity: .42 !important;
  cursor: default !important;
}

.cpe-board-shell {
  width: min(100%, 330px) !important;
  max-width: 330px !important;
  min-width: 0 !important;
  padding: 6px !important;
  overflow: hidden !important;
  border-radius: 14px !important;
  background: #0f1113 !important;
}

.cpe-board {
  display: grid !important;
  gap: 4px !important;
  width: 100% !important;
  min-width: 0 !important;
}

.cpe-cell {
  display: grid !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  aspect-ratio: 1 !important;
  place-items: center !important;
  padding: 0 !important;
  border: 1px solid rgba(255,255,255,.08) !important;
  border-radius: 8px !important;
  background: #26292d !important;
  color: #f4f4f5 !important;
  font-size: 11px !important;
  font-weight: 900 !important;
  cursor: pointer !important;
}

.cpe-cell.on {
  border-color: #68df8a !important;
  background: #285538 !important;
}

.cpe-cell.last {
  box-shadow: 0 0 0 2px rgba(104,223,138,.27) !important;
}

.cpe-info {
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 3px !important;
  color: rgba(244,244,245,.58) !important;
  font-size: 10px !important;
}

.cpe-info b {
  color: #f4f4f5 !important;
}

.cpe-msg {
  min-height: 14px !important;
  color: #f0b27b !important;
  font-size: 10px !important;
  line-height: 1.2 !important;
}

.cpe-note {
  padding: 10px !important;
  border-radius: 12px !important;
  background: rgba(104,223,138,.08) !important;
  color: rgba(244,244,245,.70) !important;
  font-size: 11px !important;
  line-height: 1.3 !important;
}

/*
 * Patrón fijo en escritorio:
 * controles a la izquierda y tablero completo a la derecha.
 */
@media (min-width: 901px) {
  .cpe:has(.cpe-board-shell) {
    grid-template-columns:
      minmax(245px, .8fr)
      minmax(290px, 1.2fr) !important;

    grid-template-areas:
      "head board"
      "modes board"
      "tools board"
      "info board"
      "message board" !important;

    grid-template-rows:
      auto
      auto
      auto
      auto
      minmax(14px,1fr) !important;

    align-items: start !important;
  }

  .cpe:has(.cpe-board-shell) > div:first-child {
    grid-area: head !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-modes {
    grid-area: modes !important;
    grid-template-columns: 1fr !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-tools {
    grid-area: tools !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-board-shell {
    grid-area: board !important;
    justify-self: center !important;
    align-self: center !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-info {
    grid-area: info !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-msg {
    grid-area: message !important;
  }
}

@media (max-width: 900px) {
  .cpe {
    overflow: visible !important;
  }

  .cpe-modes {
    grid-template-columns: 1fr !important;
  }

  .cpe-board-shell {
    width: min(100%, 360px) !important;
    max-width: 360px !important;
    margin: 0 auto !important;
  }
}
`;function Va(e,t,a){return Math.max(t,Math.min(a,e))}function Ua(e,t){const a=Number(e);return Number.isFinite(a)?Math.round(a):t}function jc(e){return Array.isArray(e)?e.map(String).filter(t=>/^\d+:\d+$/.test(t)):[]}function wc(e,t){const[a,i]=e.split(":").map(Number),[r,o]=t.split(":").map(Number);return Math.abs(a-r)+Math.abs(i-o)===1}function kc(){return`admin:${Date.now()}:${Math.random()}`}function Sc({config:e,onChange:t}){const[a,i]=S.useState(""),r=Va(Ua(e.grid_rows,5),4,6),o=Va(Ua(e.grid_cols,5),4,6),l=Va(Ua(e.path_length,11),4,r*o),d=e.pattern_mode==="fixed"?"fixed":"random_each_game",s=S.useMemo(()=>jc(e.path_cells),[e.path_cells]),c=s.length>=4&&ms(s,r,o),u={gridTemplateColumns:`repeat(${o}, minmax(0, 1fr))`},p=()=>{const b=gs(r,o,l,kc());t({game_id:"logic_circuit",completion_method:"puzzle",pattern_mode:"fixed",path_cells:b,path_length:b.length}),i("Patrón generado. Será igual para todos los jugadores.")},m=b=>{if(b==="random_each_game"){t({game_id:"logic_circuit",completion_method:"puzzle",pattern_mode:b,path_cells:[]}),i("Se generará una ruta distinta al pulsar Iniciar.");return}if(c){t({game_id:"logic_circuit",completion_method:"puzzle",pattern_mode:"fixed"}),i("Este patrón fijo será igual para todos.");return}p()},y=b=>{if(s.includes(b)){i("Esa celda ya está usada.");return}const w=s[s.length-1];if(w&&!wc(w,b)){i("La celda debe estar junto a la anterior.");return}const f=[...s,b];t({game_id:"logic_circuit",completion_method:"puzzle",pattern_mode:"fixed",path_cells:f,path_length:f.length}),i(f.length>=4?"Patrón válido. Guarda el nodo para persistirlo.":"Añade al menos cuatro celdas.")};return n.jsxs("section",{className:"cpe",children:[n.jsx("style",{children:vc}),n.jsxs("div",{children:[n.jsx("h4",{children:"Patrón del circuito"}),n.jsx("p",{children:"Elige si cambia en cada partida o si todos juegan el mismo."})]}),n.jsxs("div",{className:"cpe-modes",children:[n.jsxs("button",{type:"button",className:["cpe-mode",d==="random_each_game"?"active":""].filter(Boolean).join(" "),onClick:()=>m("random_each_game"),children:[n.jsx("b",{children:"Aleatorio en cada partida"}),n.jsx("small",{children:"Cambia cada vez que el jugador pulsa Iniciar."})]}),n.jsxs("button",{type:"button",className:["cpe-mode",d==="fixed"?"active":""].filter(Boolean).join(" "),onClick:()=>m("fixed"),children:[n.jsx("b",{children:"Patrón fijo"}),n.jsx("small",{children:"Lo generas o dibujas aquí y será igual para todos."})]})]}),d==="random_each_game"?n.jsx("div",{className:"cpe-note",children:"Cada inicio crea una ruta nueva. La ruta no cambia mientras se memoriza o resuelve."}):n.jsxs(n.Fragment,{children:[n.jsxs("div",{className:"cpe-tools",children:[n.jsx("button",{type:"button",className:"primary",onClick:p,children:"Generar otro patrón"}),n.jsx("button",{type:"button",disabled:!s.length,onClick:()=>{const b=s.slice(0,-1);t({game_id:"logic_circuit",completion_method:"puzzle",pattern_mode:"fixed",path_cells:b,path_length:Math.max(4,b.length)}),i("Última celda eliminada.")},children:"Deshacer"}),n.jsx("button",{type:"button",disabled:!s.length,onClick:()=>{t({game_id:"logic_circuit",completion_method:"puzzle",pattern_mode:"fixed",path_cells:[],path_length:l}),i("Tablero limpio. Pulsa una celda para empezar.")},children:"Limpiar y dibujar"})]}),n.jsx("div",{className:"cpe-board-shell",children:n.jsx("div",{className:"cpe-board",style:u,children:Array.from({length:r*o},(b,w)=>{const f=Math.floor(w/o),v=w%o,N=`${f}:${v}`,h=s.indexOf(N);return n.jsx("button",{type:"button",className:["cpe-cell",h>=0?"on":"",h===s.length-1?"last":""].filter(Boolean).join(" "),onClick:()=>y(N),children:h>=0?h+1:""},N)})})}),n.jsxs("div",{className:"cpe-info",children:[n.jsxs("span",{children:["Tablero:"," ",n.jsxs("b",{children:[r," × ",o]})]}),n.jsxs("span",{children:["Ruta: ",n.jsx("b",{children:s.length})]}),n.jsxs("span",{children:["Estado: ",n.jsx("b",{children:c?"válido":"incompleto"})]})]})]}),n.jsx("div",{className:"cpe-msg",children:a})]})}const Ka=[{name:"Verde",color:"#22c55e"},{name:"Rojo",color:"#ef4444"},{name:"Azul",color:"#3b82f6"},{name:"Ámbar",color:"#f59e0b"},{name:"Violeta",color:"#8b5cf6"},{name:"Cian",color:"#06b6d4"}],un={levels:{min:3,max:8,fallback:5},pad_count:{min:3,max:6,fallback:4},step_ms:{min:260,max:1200,fallback:620}},Cc=`
.sds,.sds *{box-sizing:border-box}
.sds{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(139,92,246,.14),transparent 32%),#f8fafc;color:#172033}
.sds-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.sds-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.sds-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.sds-badge{padding:7px 10px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:900;white-space:nowrap}
.sds-layout{display:grid;grid-template-columns:minmax(260px,1fr) minmax(240px,.85fr);gap:14px}
.sds-card{display:grid;gap:12px;padding:13px;border:1px solid #dbe2ea;border-radius:17px;background:rgba(255,255,255,.94)}
.sds-card h5{margin:0;font-size:14px}
.sds-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.sds-grid label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.sds-grid input,.sds-grid select{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.sds-grid small{color:#64748b;font-size:11px;font-weight:600}
.sds-pads{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;max-width:230px;margin:0 auto}
.sds-pad{aspect-ratio:1;border-radius:16px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.18)}
.sds-seq{display:flex;flex-wrap:wrap;gap:6px}
.sds-chip{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;color:#fff;font-size:11px;font-weight:900;box-shadow:inset 0 -2px 0 rgba(0,0,0,.2)}
.sds-note{padding:11px;border:1px solid #ddd6fe;border-radius:13px;background:#f5f3ff;color:#5b21b6;font-size:12px;line-height:1.45}
.sds-toggle{display:flex!important;align-items:center;gap:9px;grid-column:1/-1}
.sds-toggle input{width:18px!important;min-height:18px!important}
@media(max-width:860px){.sds-layout{grid-template-columns:1fr}}
`;function Ja(e,t){const a=Number(e[t]);return Number.isFinite(a)?a:un[t].fallback}function Ya(e,t){const{min:a,max:i,fallback:r}=un[e];return Number.isFinite(t)?Math.max(a,Math.min(i,Math.round(t))):r}function Nc(e,t,a){let i=2166136261;for(let l=0;l<e.length;l++)i^=e.charCodeAt(l),i=Math.imul(i,16777619);const r=[];let o=i>>>0;for(let l=0;l<t;l++)o=Math.imul(o,1664525)+1013904223>>>0,r.push(o%a);return r}function Ec({config:e,onChange:t}){const a=Ja(e,"levels"),i=Ja(e,"pad_count"),r=Ja(e,"step_ms"),o=e.sound_enabled!==!1,l=String(e.seed||e.maze_seed||"saga-simon"),d=S.useMemo(()=>Nc(l,a,i),[l,a,i]),s=S.useMemo(()=>{let c=0;for(let u=1;u<=a;u++){const p=Math.max(300,r-u*50);c+=u*p+1100}return Math.round(c/1e3*1.9)},[a,r]);return n.jsxs("div",{className:"sds",children:[n.jsx("style",{children:Cc}),n.jsxs("div",{className:"sds-head",children:[n.jsxs("div",{children:[n.jsx("h4",{children:"🎨 Simón Dice"}),n.jsxs("p",{children:["El jugador ve una secuencia de cuadrados de colores y la repite. Cada nivel añade un color más. Si falla, vuelve al nivel 1 pero ",n.jsx("strong",{children:"el patrón no cambia"}),", así que se puede aprender por ensayo y error."]})]}),n.jsx("span",{className:"sds-badge",children:"Memoria"})]}),n.jsxs("div",{className:"sds-layout",children:[n.jsxs("div",{className:"sds-card",children:[n.jsx("h5",{children:"Reglas"}),n.jsxs("div",{className:"sds-grid",children:[n.jsxs("label",{children:[n.jsx("span",{children:"Niveles para ganar"}),n.jsx("input",{type:"number",min:un.levels.min,max:un.levels.max,value:a,onChange:c=>t({levels:Ya("levels",Number(c.target.value))})}),n.jsx("small",{children:"El nivel N muestra N colores seguidos."})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Número de colores"}),n.jsxs("select",{value:i,onChange:c=>t({pad_count:Ya("pad_count",Number(c.target.value))}),children:[n.jsx("option",{value:3,children:"3 · fácil"}),n.jsx("option",{value:4,children:"4 · clásico"}),n.jsx("option",{value:5,children:"5 · difícil"}),n.jsx("option",{value:6,children:"6 · muy difícil"})]}),n.jsx("small",{children:"Más colores, más difícil de memorizar."})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Velocidad de la secuencia (ms)"}),n.jsx("input",{type:"number",step:20,min:un.step_ms.min,max:un.step_ms.max,value:r,onChange:c=>t({step_ms:Ya("step_ms",Number(c.target.value))})}),n.jsx("small",{children:"Menos milisegundos = se enseña más rápido."})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Semilla del patrón"}),n.jsx("input",{value:l,onChange:c=>t({seed:c.target.value.slice(0,40)}),placeholder:"saga-simon"}),n.jsx("small",{children:"Cambiarla genera otro patrón distinto."})]}),n.jsxs("label",{className:"sds-toggle",children:[n.jsx("input",{type:"checkbox",checked:o,onChange:c=>t({sound_enabled:c.target.checked})}),n.jsx("span",{children:"Sonido de los colores (cada color tiene su nota)"})]})]})]}),n.jsxs("div",{className:"sds-card",children:[n.jsx("h5",{children:"Vista previa"}),n.jsx("div",{className:"sds-pads",style:{gridTemplateColumns:i>4?"repeat(3,1fr)":"repeat(2,1fr)"},children:Ka.slice(0,i).map(c=>n.jsx("div",{className:"sds-pad",style:{background:c.color},title:c.name},c.name))}),n.jsxs("div",{children:[n.jsx("small",{style:{color:"#64748b",fontWeight:700},children:"Patrón real del nivel final:"}),n.jsx("div",{className:"sds-seq",style:{marginTop:6},children:d.map((c,u)=>n.jsx("span",{className:"sds-chip",style:{background:Ka[c].color},title:Ka[c].name,children:u+1},u))})]}),n.jsxs("div",{className:"sds-note",children:["Duración estimada: ",n.jsxs("strong",{children:["~",s,"s"]})," si acierta a la primera. Con fallos se alarga, porque vuelve al nivel 1."]})]})]})]})}const Rc=52e4,Mc=`
.pme,
.pme * {
  box-sizing: border-box;
}

.pme {
  display: grid;
  gap: 16px;
  padding: 17px;
  border: 1px solid rgba(15,23,42,.10);
  border-radius: 20px;
  background:
    radial-gradient(
      circle at 100% 0,
      rgba(34,197,94,.11),
      transparent 31%
    ),
    #f8fafc;
  color: #172033;
}

.pme-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.pme-head h4 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -.03em;
}

.pme-head p {
  max-width: 65ch;
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.pme-status {
  flex: 0 0 auto;
  padding: 7px 10px;
  border-radius: 999px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 11px;
  font-weight: 900;
}

.pme-status.ok {
  background: #dcfce7;
  color: #166534;
}

.pme-status.warn {
  background: #fef3c7;
  color: #92400e;
}

.pme-layout {
  display: grid;
  grid-template-columns:
    minmax(270px,.9fr)
    minmax(310px,1.1fr);
  gap: 15px;
  align-items: start;
}

.pme-card {
  display: grid;
  gap: 12px;
  padding: 13px;
  border: 1px solid #dbe2ea;
  border-radius: 17px;
  background: rgba(255,255,255,.92);
}

.pme-card h5 {
  margin: 0;
  font-size: 14px;
}

.pme-photo,
.pme-board,
.pme-empty {
  width: 100%;
  overflow: hidden;
  border-radius: 15px;
  background: #111315;
  aspect-ratio: 1;
}

.pme-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pme-file-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid #bbf7d0;
  border-radius: 11px;
  background: #f0fdf4;
  color: #166534;
  font-size: 11px;
  font-weight: 850;
}

.pme-file-meta b {
  flex: 0 0 auto;
  color: #14532d;
}

.pme-empty {
  display: grid;
  place-items: center;
  padding: 28px;
  color: rgba(244,244,245,.58);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
}

.pme-board {
  display: grid;
  gap: 3px;
  padding: 3px;
}

.pme-piece {
  min-width: 0;
  min-height: 0;
  border-radius: 4px;
  background-repeat: no-repeat;
  box-shadow:
    inset 0 0 0 1px
    rgba(255,255,255,.24);
}

.pme-upload {
  min-height: 52px;
  display: grid;
  place-items: center;
  padding: 11px;
  border: 1px dashed #94a3b8;
  border-radius: 13px;
  background: #f1f5f9;
  color: #334155;
  font-size: 12px;
  font-weight: 900;
  text-align: center;
  cursor: pointer;
}

.pme-upload small {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-weight: 650;
}

.pme-upload input {
  display: none;
}

.pme label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 850;
}

.pme input,
.pme select,
.pme textarea {
  width: 100%;
  min-height: 43px;
  padding: 9px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 11px;
  background: #fff;
  color: #172033;
  font: inherit;
  font-weight: 650;
}

.pme textarea {
  min-height: 74px;
  resize: vertical;
}

.pme-grid-controls {
  display: grid;
  grid-template-columns:
    repeat(2,minmax(0,1fr));
  gap: 10px;
}

.pme-wide {
  grid-column: 1 / -1;
}

.pme-sizes {
  display: grid;
  grid-template-columns:
    repeat(3,minmax(0,1fr));
  gap: 7px;
}

.pme button {
  min-height: 41px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 11px;
  background: #fff;
  color: #475569;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.pme button.active,
.pme button.primary {
  border-color: #166534;
  background: #166534;
  color: #fff;
}

.pme button.danger {
  color: #b91c1c;
}

.pme-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pme-toggle {
  display: flex !important;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  background: #f8fafc;
}

.pme-toggle input {
  width: 18px;
  min-height: 18px;
  margin: 0;
}

.pme-question {
  display: grid;
  gap: 9px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.pme-answer {
  display: grid;
  grid-template-columns:
    22px minmax(0,1fr) auto;
  gap: 7px;
  align-items: center;
}

.pme-answer input[type="radio"] {
  width: 17px;
  min-height: 17px;
  margin: 0;
}

.pme-note {
  padding: 11px 12px;
  border-left: 3px solid #22c55e;
  border-radius: 5px 12px 12px 5px;
  background: #ecfdf5;
  color: #166534;
  font-size: 12px;
  line-height: 1.45;
}

.pme-message {
  min-height: 18px;
  color: #b45309;
  font-size: 12px;
  font-weight: 850;
}

@media (max-width: 840px) {
  .pme-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .pme {
    padding: 12px;
  }

  .pme-head {
    display: grid;
  }

  .pme-status {
    justify-self: start;
  }

  .pme-grid-controls {
    grid-template-columns: 1fr;
  }

  .pme-wide {
    grid-column: 1;
  }
}
`;function yn(e,t,a,i){const r=Number(e);return Number.isFinite(r)?Math.max(a,Math.min(i,Math.round(r))):t}function zc(e){const t=String(e||"").trim();return t.length<=6e5&&(t.startsWith("data:image/jpeg;base64,")||t.startsWith("data:image/png;base64,")||t.startsWith("data:image/webp;base64,"))}function qc(e){const t=e.indexOf(",");if(t<0)return 0;const a=e.slice(t+1),i=a.endsWith("==")?2:a.endsWith("=")?1:0;return Math.max(0,Math.floor(a.length*.75)-i)}function Ac(e){const t=Array.isArray(e)?e.map(a=>String(a)).slice(0,4):[];return t.length>=2?t:["Puerta","Escudo","Campana"]}function Pc(e){return new Promise((t,a)=>{const i=new FileReader;i.onerror=()=>a(new Error("No se pudo leer la imagen.")),i.onload=()=>t(String(i.result||"")),i.readAsDataURL(e)})}function Ic(e){return new Promise((t,a)=>{const i=new Image;i.onerror=()=>a(new Error("No se pudo procesar la imagen.")),i.onload=()=>t(i),i.src=e})}function Lc(e,t,a,i){const r=document.createElement("canvas");r.width=t,r.height=t;const o=r.getContext("2d");if(!o)throw new Error("Canvas no disponible.");o.fillStyle="#111315",o.fillRect(0,0,t,t);const l=Math.max(t/e.width,t/e.height),d=e.width*l,s=e.height*l;return o.drawImage(e,(t-d)/2,(t-s)/2,d,s),r.toDataURL(a,i)}async function $c(e){if(!["image/jpeg","image/png","image/webp"].includes(e.type))throw new Error("Usa una fotografía JPG, PNG o WebP.");const t=await Pc(e),a=await Ic(t),i=[[640,"image/webp",.8],[560,"image/webp",.74],[512,"image/jpeg",.72],[448,"image/jpeg",.66]];for(const[r,o,l]of i){const d=Lc(a,r,o,l);if((o!=="image/webp"||d.startsWith("data:image/webp"))&&d.length<=Rc)return d}throw new Error("La imagen sigue siendo demasiado grande.")}function Tc({config:e,onChange:t}){const[a,i]=S.useState(""),r=String(e.image_data_url||""),o=zc(r),l=o?Math.max(1,Math.round(qc(r)/1024)):0,d=yn(e.grid_size,3,2,4),s=yn(e.preview_ms,5e3,0,6e3),c=s<=0?0:s<=2500?5e3:Math.max(4e3,s),u=yn(e.max_moves,0,0,500),p=e.require_final_question===!0,m=S.useMemo(()=>Ac(e.final_choices),[e.final_choices]),y=yn(e.final_correct_index,0,0,m.length-1),b=String(e.final_question||""),w=!p||b.trim().length>=3&&m.length>=2&&m.every(C=>C.trim().length>0),f=o&&w,v=o?w?"Listo para guardar":"Revisa la pregunta":"Falta la fotografía";async function N(C){var U;const z=C.currentTarget,B=(U=z.files)==null?void 0:U[0];if(B){i("Preparando la fotografía…");try{const ee=await $c(B);t({objective:"image_mosaic",game_id:"place_mosaic",completion_method:"puzzle",image_data_url:ee,image_alt:String(e.image_alt||B.name.replace(/\.[^.]+$/,"")).slice(0,120),grid_size:d,grid_cols:d,grid_rows:d}),i("Fotografía preparada. Guarda el nodo.")}catch(ee){i(ee instanceof Error?ee.message:"No se pudo preparar la imagen.")}finally{z.value=""}}}function h(C,z=y){const B=C.slice(0,4);t({final_choices:B,final_correct_index:Math.max(0,Math.min(B.length-1,z))})}return n.jsxs("section",{className:"pme","aria-label":"Editor de Mosaico del lugar",children:[n.jsx("style",{children:Mc}),n.jsxs("header",{className:"pme-head",children:[n.jsxs("div",{children:[n.jsx("h4",{children:"Mosaico del lugar"}),n.jsx("p",{children:"Sube una fotografía del punto real. Se recorta, comprime y guarda dentro de la misión para jugar sin conexión."})]}),n.jsx("span",{className:["pme-status",f?"ok":o?"warn":""].filter(Boolean).join(" "),children:v})]}),n.jsxs("div",{className:"pme-layout",children:[n.jsxs("article",{className:"pme-card",children:[n.jsx("h5",{children:"Fotografía del lugar"}),o?n.jsx("div",{className:"pme-photo",children:n.jsx("img",{src:r,alt:String(e.image_alt||"Fotografía del reto")})}):n.jsx("div",{className:"pme-empty",children:"Usa una fotografía clara del molino, estatua, fachada, grabado o detalle que el jugador pueda observar en el lugar real."}),o?n.jsxs("div",{className:"pme-file-meta",children:[n.jsx("span",{children:"✓ Lista para modo offline"}),n.jsxs("b",{children:[l," KB"]})]}):null,n.jsxs("label",{className:"pme-upload",children:[o?"Cambiar fotografía":"Subir fotografía",n.jsx("small",{children:"JPG, PNG o WebP. Se comprime automáticamente."}),n.jsx("input",{type:"file",accept:"image/jpeg,image/png,image/webp",onChange:C=>void N(C)})]}),o?n.jsx("button",{type:"button",className:"danger",onClick:()=>{t({image_data_url:""}),i("Fotografía eliminada.")},children:"Quitar fotografía"}):null,n.jsxs("label",{children:["Descripción de la imagen",n.jsx("input",{value:String(e.image_alt||""),maxLength:120,placeholder:"Ejemplo: Fachada del molino",onChange:C=>t({image_alt:C.target.value})})]})]}),n.jsxs("article",{className:"pme-card",children:[n.jsx("h5",{children:"Vista previa del mosaico"}),o?n.jsx("div",{className:"pme-board",style:{gridTemplateColumns:`repeat(${d}, minmax(0, 1fr))`},children:Array.from({length:d*d},(C,z)=>{const B=Math.floor(z/d),U=z%d,ee=d<=1?0:U/(d-1)*100,_e=d<=1?0:B/(d-1)*100;return n.jsx("div",{className:"pme-piece",style:{backgroundImage:`url("${r}")`,backgroundSize:`${d*100}% ${d*100}%`,backgroundPosition:`${ee}% ${_e}%`}},z)})}):n.jsx("div",{className:"pme-empty",children:"La cuadrícula aparecerá al subir una fotografía."}),n.jsxs("div",{className:"pme-grid-controls",children:[n.jsxs("label",{className:"pme-wide",children:["Tamaño del tablero",n.jsx("div",{className:"pme-sizes",children:[2,3,4].map(C=>n.jsxs("button",{type:"button",className:d===C?"active":"",onClick:()=>t({grid_size:C,grid_cols:C,grid_rows:C}),children:[C," × ",C]},C))})]}),n.jsxs("label",{children:["Tiempo para observar la imagen",n.jsxs("select",{value:c,onChange:C=>t({preview_ms:Number(C.target.value)}),children:[n.jsx("option",{value:0,children:"No mostrar"}),n.jsx("option",{value:4e3,children:"4 segundos"}),n.jsx("option",{value:5e3,children:"5 segundos · recomendado"}),n.jsx("option",{value:6e3,children:"6 segundos"})]}),n.jsx("small",{children:"La imagen inicial nunca durará menos de cuatro segundos."})]}),n.jsxs("label",{children:["Límite de movimientos",n.jsx("input",{type:"number",min:0,max:500,value:u,onChange:C=>t({max_moves:yn(C.target.value,0,0,500)})}),n.jsx("small",{children:"0 significa sin límite."})]})]}),n.jsxs("label",{className:"pme-toggle",children:[n.jsx("input",{type:"checkbox",checked:p,onChange:C=>t({require_final_question:C.target.checked,final_question:b||"¿Qué detalle aparece en el lugar real?",final_choices:m,final_correct_index:y})}),"Añadir una pregunta final sobre el lugar real"]}),p?n.jsxs("div",{className:"pme-question",children:[n.jsxs("label",{children:["Pregunta final",n.jsx("textarea",{value:b,maxLength:180,placeholder:"¿Qué símbolo aparece sobre la puerta?",onChange:C=>t({final_question:C.target.value})})]}),n.jsx("strong",{children:"Marca la respuesta correcta"}),m.map((C,z)=>n.jsxs("div",{className:"pme-answer",children:[n.jsx("input",{type:"radio",name:"mosaic-correct-answer",checked:y===z,"aria-label":`Respuesta correcta ${z+1}`,onChange:()=>t({final_correct_index:z})}),n.jsx("input",{value:C,maxLength:60,placeholder:`Respuesta ${z+1}`,onChange:B=>{const U=[...m];U[z]=B.target.value,h(U)}}),n.jsx("button",{type:"button",className:"danger",disabled:m.length<=2,onClick:()=>{const B=m.filter((ee,_e)=>_e!==z),U=y===z?0:y>z?y-1:y;h(B,U)},children:"Quitar"})]},`mosaic-answer-${z}`)),n.jsx("div",{className:"pme-actions",children:n.jsx("button",{type:"button",disabled:m.length>=4,onClick:()=>h([...m,`Opción ${m.length+1}`]),children:"Añadir respuesta"})})]}):null,n.jsx("div",{className:"pme-message","aria-live":"polite",children:a})]})]}),n.jsx("div",{className:"pme-note",children:"En el móvil se mezclan las piezas. El jugador toca dos piezas para intercambiarlas. Cuando reconstruye la fotografía, completa la pregunta final si está activada."})]})}const Fc=`
.tme,.tme *{box-sizing:border-box}
.tme{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(34,197,94,.12),transparent 32%),#f8fafc;color:#172033}
.tme-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.tme-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.tme-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.tme-badge{padding:7px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:900;white-space:nowrap}
.tme-layout{display:grid;grid-template-columns:minmax(290px,1.1fr) minmax(260px,.9fr);gap:14px}
.tme-card{display:grid;gap:12px;padding:13px;border:1px solid #dbe2ea;border-radius:17px;background:rgba(255,255,255,.94)}
.tme-card h5{margin:0;font-size:14px}
.tme-board{display:grid;width:100%;max-width:520px;margin:auto;background:#111315;border:6px solid #111315;border-radius:18px;overflow:hidden;aspect-ratio:1}
.tme-cell{display:grid;place-items:center;min-width:0;min-height:0;border-style:solid;border-color:#94a3b8;background:#1a1d20;color:#fff;font-size:clamp(7px,1.2vw,13px)}
.tme-cell.start{background:#17321f}
.tme-cell.goal{background:#25375d}
.tme-cell.hole{background:#35191d}
.tme-cell.item{background:#40351a}
.tme-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.tme-controls label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.tme-controls select,.tme-controls input{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.tme-wide{grid-column:1/-1}
.tme-modes,.tme-sizes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.tme-sizes{grid-template-columns:repeat(3,minmax(0,1fr))}
.tme button{min-height:42px;padding:9px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#334155;font-weight:900;cursor:pointer}
.tme button.active,.tme button.primary{border-color:#16a34a;background:#16a34a;color:#fff}
.tme-note{padding:11px;border:1px solid #bbf7d0;border-radius:13px;background:#f0fdf4;color:#166534;font-size:12px;line-height:1.45}
.tme-toggle{display:flex!important;grid-column:1/-1!important;align-items:center;gap:9px}
.tme-toggle input{width:18px!important;min-height:18px!important}
.tme-message{min-height:18px;color:#166534;font-size:12px;font-weight:800}
@media(max-width:860px){.tme-layout{grid-template-columns:1fr}.tme-board{max-width:430px}}
`;function Mt(e,t,a,i){const r=Number(e);return Math.max(a,Math.min(i,Number.isFinite(r)?Math.round(r):t))}function Dc(){return["maze",Date.now().toString(36),Math.random().toString(36).slice(2,9)].join("-")}const Oc=[{label:"Corto",rows:7,cols:7,difficulty:"easy"},{label:"Medio",rows:9,cols:9,difficulty:"normal"},{label:"Largo",rows:11,cols:11,difficulty:"hard"}];function Bc({config:e,onChange:t}){const[a,i]=S.useState(""),r=Mt(e.grid_rows,9,5,13),o=Mt(e.grid_cols,9,5,13),l=String(e.maze_seed||"saga-maze"),d=e.pattern_mode==="random_each_game"?"random_each_game":"fixed",s=Mt(e.hole_count,4,0,18),c=Mt(e.collectible_count,2,0,6),u=Mt(e.lives,3,1,5),p=Mt(e.time_limit_s,75,20,180),m=S.useMemo(()=>fs({rows:r,cols:o,seed:l,holeCount:s,collectibleCount:c}),[r,o,l,s,c]),y=new Set(m.holes),b=new Set(m.collectibles);function w(f){t({objective:"balance_maze",game_id:"tilt_maze",completion_method:"motion",...f})}return n.jsxs("section",{className:"tme","aria-label":"Editor de Laberinto de equilibrio",children:[n.jsx("style",{children:Fc}),n.jsxs("header",{className:"tme-head",children:[n.jsxs("div",{children:[n.jsx("h4",{children:"Laberinto de equilibrio"}),n.jsx("p",{children:"El laberinto se genera automáticamente. No es necesario dibujar paredes manualmente."})]}),n.jsx("span",{className:"tme-badge",children:"Listo para guardar"})]}),n.jsxs("div",{className:"tme-layout",children:[n.jsxs("article",{className:"tme-card",children:[n.jsx("h5",{children:"Vista previa"}),n.jsx("div",{className:"tme-board",style:{gridTemplateColumns:`repeat(${o},minmax(0,1fr))`,gridTemplateRows:`repeat(${r},minmax(0,1fr))`},children:m.cells.map((f,v)=>{const N=["tme-cell",v===m.start?"start":"",v===m.goal?"goal":"",y.has(v)?"hole":"",b.has(v)?"item":""].filter(Boolean).join(" ");return n.jsx("div",{className:N,style:{borderTopWidth:f.walls&ys?2:0,borderRightWidth:f.walls&xs?2:0,borderBottomWidth:f.walls&bs?2:0,borderLeftWidth:f.walls&hs?2:0},children:v===m.start?"●":v===m.goal?"⚑":b.has(v)?"◆":y.has(v)?"×":""},v)})}),n.jsx("div",{className:"tme-note",children:"● inicio · ⚑ meta · ◆ objeto obligatorio · × agujero"}),n.jsx("button",{type:"button",className:"primary",onClick:()=>{w({maze_seed:Dc(),pattern_mode:"fixed"}),i("Nuevo laberinto generado y fijado.")},children:"Generar otro laberinto"})]}),n.jsxs("article",{className:"tme-card",children:[n.jsx("h5",{children:"Ajustes del reto"}),n.jsxs("div",{className:"tme-controls",children:[n.jsxs("label",{className:"tme-wide",children:["Tamaño",n.jsx("div",{className:"tme-sizes",children:Oc.map(f=>n.jsxs("button",{type:"button",className:r===f.rows&&o===f.cols?"active":"",onClick:()=>w({grid_rows:f.rows,grid_cols:f.cols,difficulty:f.difficulty}),children:[f.label,n.jsx("br",{}),f.cols,"×",f.rows]},f.label))})]}),n.jsxs("label",{className:"tme-wide",children:["Variación",n.jsxs("div",{className:"tme-modes",children:[n.jsx("button",{type:"button",className:d==="fixed"?"active":"",onClick:()=>w({pattern_mode:"fixed"}),children:"Fijo para todos"}),n.jsx("button",{type:"button",className:d==="random_each_game"?"active":"",onClick:()=>w({pattern_mode:"random_each_game"}),children:"Nuevo por partida"})]})]}),n.jsxs("label",{children:["Tiempo",n.jsx("input",{type:"number",min:20,max:180,value:p,onChange:f=>w({time_limit_s:Mt(f.target.value,75,20,180)})})]}),n.jsxs("label",{children:["Vidas",n.jsx("input",{type:"number",min:1,max:5,value:u,onChange:f=>w({lives:Mt(f.target.value,3,1,5)})})]}),n.jsxs("label",{children:["Agujeros",n.jsx("input",{type:"number",min:0,max:18,value:s,onChange:f=>w({hole_count:Mt(f.target.value,4,0,18)})})]}),n.jsxs("label",{children:["Objetos",n.jsx("input",{type:"number",min:0,max:6,value:c,onChange:f=>w({collectible_count:Mt(f.target.value,2,0,6)})})]}),n.jsxs("label",{className:"tme-toggle",children:[n.jsx("input",{type:"checkbox",checked:e.sensor_enabled!==!1,onChange:f=>w({sensor_enabled:f.target.checked})}),"Usar inclinación del móvil"]})]}),n.jsx("div",{className:"tme-note",children:"Los botones táctiles siempre estarán disponibles como respaldo. El generador garantiza una ruta válida entre inicio y meta."}),n.jsx("div",{className:"tme-message",children:a})]})]})]})}const rt={target_hits:{min:3,max:40,fallback:12},time_limit_s:{min:15,max:180,fallback:45},spawn_interval_ms:{min:250,max:2500,fallback:700},spark_life_ms:{min:600,max:4e3,fallback:1600},echo_penalty_s:{min:0,max:10,fallback:2}},Gc=`
.spr,.spr *{box-sizing:border-box}
.spr{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(45,212,191,.14),transparent 32%),#f8fafc;color:#172033}
.spr-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.spr-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.spr-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.spr-badge{padding:7px 10px;border-radius:999px;background:#ccfbf1;color:#115e59;font-size:11px;font-weight:900;white-space:nowrap}
.spr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.spr-grid label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.spr-grid input,.spr-grid select{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.spr-grid small{color:#64748b;font-size:11px;font-weight:600}
.spr-note{padding:11px;border:1px solid #99f6e4;border-radius:13px;background:#f0fdfa;color:#115e59;font-size:12px;line-height:1.45}
.spr-warn{border-color:#fed7aa;background:#fff7ed;color:#9a3412}
@media(max-width:860px){.spr-grid{grid-template-columns:1fr}}
`;function _n(e,t){const a=Number(e[t]);return Number.isFinite(a)?a:rt[t].fallback}function vn(e,t){const{min:a,max:i,fallback:r}=rt[e];return Number.isFinite(t)?Math.max(a,Math.min(i,Math.round(t))):r}function Hc({config:e,onChange:t}){const a=_n(e,"target_hits"),i=_n(e,"time_limit_s"),r=_n(e,"spawn_interval_ms"),o=_n(e,"spark_life_ms"),l=_n(e,"echo_penalty_s"),d=Number(e.echo_ratio),s=Number.isFinite(d)?Math.max(0,Math.min(.6,d)):.28,c=S.useMemo(()=>{const p=Math.floor(i*1e3/Math.max(1,r)),m=Math.floor(p*(1-s)),y=m/Math.max(1,a);let b,w;return y<1.15?(b="Casi imposible: harían falta casi todos los aciertos y sin fallar ninguno.",w="warn"):y<1.6?(b="Exigente: hay poco margen de error. Bien para jugadores rápidos.",w="ok"):y<3?(b="Equilibrado: se supera con atención, se falla si te despistas.",w="ok"):(b="Muy fácil: sobran señales de sobra. Sube el objetivo o baja el tiempo.",w="warn"),{spawned:p,greens:m,verdict:b,tone:w}},[i,r,s,a]);function u(p){t(p)}return n.jsxs("div",{className:"spr",children:[n.jsx("style",{children:Gc}),n.jsxs("div",{className:"spr-head",children:[n.jsxs("div",{children:[n.jsx("h4",{children:"📡 Caza-Señales"}),n.jsx("p",{children:"Aparecen chispas verdes durante un instante y el jugador debe tocarlas. Las rojas son señales falsas: restan tiempo. Sin GPS, sin sensores y sin conexión."})]}),n.jsx("span",{className:"spr-badge",children:"Reflejos"})]}),n.jsxs("div",{className:"spr-grid",children:[n.jsxs("label",{children:[n.jsx("span",{children:"Señales para ganar"}),n.jsx("input",{type:"number",min:rt.target_hits.min,max:rt.target_hits.max,value:a,onChange:p=>u({target_hits:vn("target_hits",Number(p.target.value))})}),n.jsxs("small",{children:["Entre ",rt.target_hits.min," y ",rt.target_hits.max,"."]})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Tiempo límite (segundos)"}),n.jsx("input",{type:"number",min:rt.time_limit_s.min,max:rt.time_limit_s.max,value:i,onChange:p=>u({time_limit_s:vn("time_limit_s",Number(p.target.value))})}),n.jsxs("small",{children:["Entre ",rt.time_limit_s.min,"s y ",rt.time_limit_s.max,"s."]})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Aparece una chispa cada (ms)"}),n.jsx("input",{type:"number",step:50,min:rt.spawn_interval_ms.min,max:rt.spawn_interval_ms.max,value:r,onChange:p=>u({spawn_interval_ms:vn("spawn_interval_ms",Number(p.target.value))})}),n.jsx("small",{children:"Menos milisegundos = más frenético."})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Cada chispa dura (ms)"}),n.jsx("input",{type:"number",step:100,min:rt.spark_life_ms.min,max:rt.spark_life_ms.max,value:o,onChange:p=>u({spark_life_ms:vn("spark_life_ms",Number(p.target.value))})}),n.jsx("small",{children:"Cuánto tiempo tiene para tocarla antes de que se apague."})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Proporción de ecos rojos"}),n.jsxs("select",{value:String(s),onChange:p=>u({echo_ratio:Number(p.target.value)}),children:[n.jsx("option",{value:"0",children:"Ninguno (0%)"}),n.jsx("option",{value:"0.15",children:"Pocos (15%)"}),n.jsx("option",{value:"0.28",children:"Normal (28%)"}),n.jsx("option",{value:"0.4",children:"Muchos (40%)"}),n.jsx("option",{value:"0.6",children:"Caos (60%)"})]}),n.jsx("small",{children:"Los ecos rojos nunca deben ser mayoría."})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Penalización por eco (segundos)"}),n.jsx("input",{type:"number",min:rt.echo_penalty_s.min,max:rt.echo_penalty_s.max,value:l,onChange:p=>u({echo_penalty_s:vn("echo_penalty_s",Number(p.target.value))})}),n.jsx("small",{children:"Segundos que pierde al tocar una chispa roja."})]})]}),n.jsxs("div",{className:c.tone==="warn"?"spr-note spr-warn":"spr-note",children:[n.jsx("strong",{children:"Con estos ajustes:"})," aparecerán unas ",c.spawned," chispas, de las que ~",c.greens," serán verdes, para un objetivo de ",a,". ",c.verdict]})]})}function Wc({stage:e,onPatch:t,onClose:a,onDelete:i,onRequestChangeType:r,stages:o=[]}){var de,De,Se,Xe,Oe,te,lt,Ye,Ke,tt,gt,Et,me;const[l,d]=S.useState(()=>In(e)?2:0),[s,c]=S.useState(null),[u,p]=S.useState(!1),[m,y]=S.useState(()=>Fn(e)?"map_collectible":ya(e)?"qr":"game");S.useEffect(()=>{y(Fn(e)?"map_collectible":ya(e)?"qr":"game"),d(In(e)?2:0)},[e.id,e.index]);const b=m,w=ld(e),f=b==="qr"&&w.category==="physical"?w:wd(Fr(e.physical_node_kind??e.physical_item_kind)),v=b==="game"&&w.category!=="physical"?w:ro(u)[0],N=((de=rn[l])==null?void 0:de.key)||"subtype";rd(e);const h=Wt(e),C=kd(h),z=tl(xn(e),C);String(h.qr_validation_signature??""),b==="game"&&vd(v);const B=S.useMemo(()=>o.filter(g=>{var A,T;return g.id===e.id?!1:!!(g.physical_item_id??((A=g.physical_qr)==null?void 0:A.item_id)??((T=g.config)==null?void 0:T.physical_item_id)??"")}).map(g=>{var Z,ce,Ce,Ne;const x=g.physical_item_id??((Z=g.physical_qr)==null?void 0:Z.item_id)??((ce=g.config)==null?void 0:ce.physical_item_id)??"",A=g.physical_item_label??((Ce=g.physical_qr)==null?void 0:Ce.label)??g.title??`Nodo ${g.index+1}`,T=g.physical_node_kind==="collectible"||g.is_map_collectible||(Ne=g.config)!=null&&Ne.is_map_collectible?"🎁":"🔑";return{id:x,label:`${T} ${A} (del Nodo ${g.index+1})`}}),[o,e.id]),U=S.useMemo(()=>Math.round((l+1)/rn.length*100),[l]),ee=()=>d(g=>Math.min(g+1,rn.length-1)),_e=()=>d(g=>Math.max(g-1,0)),pe=g=>d(Math.max(0,rn.findIndex(x=>x.key===g)));function ke(g){c(g),window.setTimeout(()=>c(null),1800)}function je(g,x){const A={...h,[g]:Sd(g,x)};t({config:A,objective:g==="objective"?x:e.objective})}function mt(g){y("game");const x=Pt(g.id),A={...x.config||{},game_id:g.id,game_title:g.title,completion_method:g.completionMethod},T=g.id==="sequence_code"?"La clave del tríptico":g.id==="place_mosaic"?"Mosaico del lugar":g.id==="tilt_maze"?"Laberinto de equilibrio":g.id==="logic_circuit"?"Matriz de circuitos":g.title,Z=qi(e.title)?T:e.title;t({...x,title:Z,_clear_physical_fields:!0,physical_qr:null,physical_node_kind:null,physical_item_kind:null,physical_item_id:"",physical_item_label:"",qr_payload:"",game_family:g.family,game_type:g.id,game_template_id:g.id,completion_method:g.completionMethod,entry_mode:g.completionMethod==="bearing"?"bearing":g.completionMethod==="manual_code"?"manual":g.category==="motion"||g.completionMethod==="motion"||g.category==="logic"?"free":"gps",requires_proximity:!(g.category==="logic"||g.category==="motion"||g.completionMethod==="motion"),radius_m:Number(e.radius_m||e.proximity_radius_m||e.radius||50),proximity_radius_m:Number(e.proximity_radius_m||e.radius_m||e.radius||50),config:A,messages:g.messages,content:g.content,description:g.content}),pe("config")}function Fe(){if(b==="game"&&v.id==="tilt_maze"&&!md(h)){ke("Revisa tamaño, tiempo y vidas del laberinto."),pe("config");return}if(b==="game"&&v.id==="place_mosaic"&&!gd(h)){ke("Sube una fotografía y revisa la pregunta final."),pe("config");return}if(b==="game"&&v.id==="sequence_code"&&!pd(h)){ke("La secuencia necesita entre 3 y 10 fichas diferentes."),pe("config");return}if(b==="game"&&v.id==="logic_circuit"&&!ud(h)){ke("El patrón fijo está incompleto o contiene saltos."),pe("config");return}if(b==="game"){const g=Pt(v.id),x={...g.config||{},...h,is_map_collectible:!1,game_id:v.id,game_title:v.title,completion_method:v.completionMethod},A=String(e.content||e.description||v.content||""),T=v.id==="sequence_code"&&bd(A)?v.content:A||v.content,Z=e.messages||v.messages,ce=v.id==="sequence_code"&&xd(Z==null?void 0:Z.hint)?v.messages:Z,Ce=v.id==="sequence_code"&&fd(e.title)?"La clave del tríptico":v.id==="place_mosaic"&&hd(e.title)?"Mosaico del lugar":e.title;t({...g,_clear_physical_fields:!0,physical_qr:null,physical_node_kind:null,physical_item_kind:null,physical_item_id:"",physical_item_label:"",qr_payload:"",game_family:v.family,game_type:v.id,game_template_id:v.id,completion_method:v.completionMethod,entry_mode:v.completionMethod==="bearing"?"bearing":v.completionMethod==="manual_code"?"manual":v.category==="motion"||v.completionMethod==="motion"||v.category==="logic"?"free":"gps",requires_proximity:!(v.category==="logic"||v.category==="motion"||v.completionMethod==="motion"),radius_m:Number(e.radius_m||e.proximity_radius_m||e.radius||50),proximity_radius_m:Number(e.proximity_radius_m||e.radius_m||e.radius||50),config:x,title:Ce,messages:ce,content:T,description:T})}a()}function K(g,x){const A=(x==null?void 0:x.kind)||lo(g),T=(x==null?void 0:x.label)||Kt(e),Z=(x==null?void 0:x.item_id)||sn(e),ce=(x==null?void 0:x.payload)||xn(e),Ce=x||{item_id:Z,label:T,kind:A,payload:ce,card_text:`${g.icon} ${T}
${g.title}
Escanea esta tarjeta en SAGA.`,updated_at:new Date().toISOString()},Ne=Pt(g.id),Be={...Ne.config||{},...h,game_id:g.id,game_title:g.title,completion_method:g.completionMethod,success_code:Yn(e)};return{...Ne,physical_qr:Ce,physical_node_kind:A,physical_item_kind:A,physical_item_id:Z,physical_item_label:T,game_family:"physical_qr",game_type:g.id,game_template_id:g.id,entry_mode:"qr",completion_method:g.completionMethod,requires_proximity:!1,qr_payload:ce,fallback_code:Yn(e),physical_fallback_code:Yn(e),config:Be,messages:g.messages,content:g.content,description:g.content}}function we(g){y("qr"),t(K(g)),pe("config")}function qe(){const g=lo(f),x=Kt(e),A=sn(e),T=xn(e),Z={item_id:A,label:x,kind:g,payload:T,card_text:`${f.icon} ${x}
${f.title}
Escanea esta tarjeta en SAGA.`,updated_at:new Date().toISOString()};t(K(f,Z)),ke("QR aplicado al nodo. Pulsa Guardar para persistir.")}function He(g,x){const A=Number(x);t({[g]:Number.isFinite(A)?A:0})}const Ue=jd(b==="qr"?f:v,h);return n.jsxs("section",{className:"saga-guided-editor-v4","aria-label":"Editor guiado de nodo",children:[n.jsxs("header",{className:"saga-guided-v4-header",children:[n.jsxs("div",{className:"saga-guided-v4-titleblock",children:[n.jsx("span",{children:"EDITOR GUIADO"}),n.jsxs("div",{style:{margin:"6px 0 8px 0",width:"100%",maxWidth:"540px"},children:[n.jsx("label",{style:{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",color:"#fbbf24",display:"flex",alignItems:"center",gap:6,marginBottom:4},children:"✏️ Nombre del nodo / Ubicación"}),n.jsx("input",{type:"text",value:String(e.title||"").replace(/^\d+\.\s*/,""),onChange:g=>t({title:g.target.value}),placeholder:"Escribe el nombre de esta ubicación (ej. Senda Forestal Norte)...",style:{width:"100%",fontSize:18,fontWeight:800,background:"rgba(15, 23, 42, 0.85)",border:"1.5px solid rgba(251, 191, 36, 0.5)",borderRadius:10,padding:"8px 14px",color:"#ffffff",outline:"none",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}})]}),n.jsxs("div",{className:"saga-guided-v4-chips",children:[n.jsx("b",{children:b==="qr"?`${f.icon} ${f.title}`:b==="map_collectible"?"⭐ Objeto QR":`${v.icon} ${v.title}`}),n.jsx("b",{children:b==="map_collectible"?"Jugable":Ga(b==="qr"?f:v)}),n.jsx("b",{children:b==="map_collectible"?"Offline listo":Ha(b==="qr"?f:v)}),e.lat!=null&&e.lon!=null?n.jsxs("b",{children:[Number(e.lat).toFixed(5),", ",Number(e.lon).toFixed(5)]}):null]})]}),n.jsxs("div",{className:"saga-guided-v4-actions",children:[n.jsx("button",{type:"button",className:"primary-soft",onClick:()=>{r?r():t({_type_choice_done:!1})},children:"Cambiar tipo"}),n.jsx("button",{type:"button",className:"danger",onClick:i,children:"Eliminar"}),n.jsx("button",{type:"button",onClick:a,children:"Cerrar ×"})]})]}),n.jsx("nav",{className:"saga-guided-v4-stepper","aria-label":"Pasos del editor guiado",children:rn.map((g,x)=>n.jsxs("button",{type:"button",className:x===l?"active":"",onClick:()=>d(x),children:[n.jsx("span",{children:x+1}),n.jsx("b",{children:g.label})]},g.key))}),n.jsx("div",{className:"saga-guided-v4-progress","aria-hidden":"true",children:n.jsx("i",{style:{width:`${U}%`}})}),n.jsxs("main",{className:"saga-guided-v4-body",children:[N==="rules"?n.jsxs("section",{className:"saga-guided-v4-page",children:[n.jsxs("div",{className:"saga-guided-v4-pagehead",children:[n.jsx("span",{children:"Paso 1 de 3"}),n.jsx("h3",{children:"🎯 Tipo y Reglas de Acceso"}),n.jsx("p",{children:"Selecciona la experiencia y define la distancia y requisitos para jugar."})]}),n.jsxs("div",{className:"saga-guided-v4-formgrid",children:[b==="game"&&In(e)?n.jsx("div",{className:"wide",children:n.jsxs("article",{className:"saga-guided-v4-note wide",style:{borderLeft:"3px solid #34d399",background:"rgba(52, 211, 153, 0.06)",padding:14,borderRadius:8,marginBottom:12},children:[n.jsx("b",{children:"📍 Checkpoint / Pista"}),n.jsx("span",{children:"Este nodo solo muestra un texto, historia o pista cuando el jugador llega al punto. No tiene minijuego. Escribe el texto en el paso 3 (Historia y Pistas). Si quieres convertirlo en minijuego, elige una plantilla debajo."})]})}):null,b==="game"?n.jsxs("div",{className:"wide",children:[n.jsxs("div",{className:"saga-guided-v4-toggle-row",style:{marginBottom:12},children:[n.jsx("span",{children:u?"Mostrando también juegos experimentales/no listos.":"Mostrando solo juegos jugables ahora."}),n.jsx("button",{type:"button",onClick:()=>p(g=>!g),children:u?"Ocultar no listos":"Mostrar experimentales"})]}),n.jsx("div",{className:"saga-guided-v4-catalog-grid",children:ro(u).map(g=>n.jsxs("button",{type:"button",className:v.id===g.id?"active":"",onClick:()=>mt(g),children:[n.jsx("i",{children:g.icon}),n.jsx("strong",{children:g.title}),n.jsx("small",{children:g.summary}),n.jsxs("em",{className:yd(g)?"warning":"",children:[Ga(g)," · ",Ha(g)," · ",g.duration]})]},g.id))})]}):null,b==="qr"?n.jsx("div",{className:"wide",children:n.jsx("div",{className:"saga-guided-v4-choice-grid",children:sd().map(g=>n.jsxs("button",{type:"button",className:f.id===g.id?"active":"",onClick:()=>we(g),children:[n.jsx("i",{children:g.icon}),n.jsx("strong",{children:g.title}),n.jsx("small",{children:g.summary}),n.jsxs("em",{children:[Ga(g)," · ",Ha(g)]})]},g.id))})}):null,b==="map_collectible"?n.jsx("div",{className:"wide",children:n.jsxs("article",{className:"saga-guided-v4-note wide",style:{borderLeft:"3px solid var(--saga-primary)",background:"rgba(14, 165, 233, 0.04)",padding:14,borderRadius:8},children:[n.jsx("b",{children:"📌 Coleccionable Digital en Mapa"}),n.jsx("span",{children:"El jugador recoge este objeto automáticamente al estar físicamente en la ubicación GPS."})]})}):null,b==="game"&&dd(v)?n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"📍 Radio de aproximación (metros)"}),n.jsx("input",{type:"number",value:Number(e.radius_m||e.proximity_radius_m||e.radius||50),onChange:g=>{He("radius_m",g.target.value),He("proximity_radius_m",g.target.value),He("radius",g.target.value)}}),n.jsx("small",{children:"Distancia a la que el nodo se vuelve interactivo en el mapa."})]}):b==="map_collectible"?n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"📍 Radio de recolección (metros)"}),n.jsx("input",{type:"number",value:Number(e.radius_m||e.proximity_radius_m||e.radius||30),onChange:g=>{He("radius_m",g.target.value),He("proximity_radius_m",g.target.value),He("radius",g.target.value)}}),n.jsx("small",{children:"Distancia para poder recoger el objeto del mapa."})]}):null,n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"🔑 ¿Requiere algún objeto de la mochila para abrirse?"}),n.jsxs("select",{value:e.required_item_id?["llave_maestra","emp_device","decodificador_cuantico","escaner_biometrico","amuleto_guardian","elixir_alquimia","escudo_runico","orbe_fuego","reliquia_sagrada","amuleto_vision"].includes(e.required_item_id)||B.some(g=>g.id===e.required_item_id)?e.required_item_id:"custom":"none",onChange:g=>{const x=g.target.value;t(x==="none"?{required_item_id:"",requires_item:!1}:x==="custom"?{required_item_id:"item_requerido",requires_item:!0}:{required_item_id:x,requires_item:!0})},children:[n.jsx("option",{value:"none",children:"🟢 Ninguno (Abierto a todos los jugadores)"}),n.jsx("option",{value:"llave_maestra",children:"🔑 Requiere Llave Maestra"}),n.jsx("option",{value:"emp_device",children:"⚡ Requiere Dispositivo EMP"}),n.jsx("option",{value:"decodificador_cuantico",children:"💻 Requiere Decodificador Cuántico"}),n.jsx("option",{value:"escaner_biometrico",children:"🔬 Requiere Escáner Biométrico"}),n.jsx("option",{value:"amuleto_guardian",children:"🛡️ Requiere Amuleto del Guardián"}),n.jsx("option",{value:"elixir_alquimia",children:"🧪 Requiere Elixir de Alquimia"}),n.jsx("option",{value:"escudo_runico",children:"🛡️ Requiere Escudo Rúnico"}),n.jsx("option",{value:"orbe_fuego",children:"🔮 Requiere Orbe de Fuego Arcano"}),n.jsx("option",{value:"reliquia_sagrada",children:"🏛️ Requiere Reliquia Sagrada"}),n.jsx("option",{value:"amuleto_vision",children:"👁️ Requiere Amuleto de Visión"}),B.map(g=>n.jsx("option",{value:g.id,children:g.label},g.id)),n.jsx("option",{value:"custom",children:"✏️ ID personalizado..."})]})]}),e.required_item_id&&!["llave_maestra","emp_device","decodificador_cuantico","escaner_biometrico","amuleto_guardian","elixir_alquimia","escudo_runico","orbe_fuego","reliquia_sagrada","amuleto_vision"].includes(e.required_item_id)&&!B.some(g=>g.id===e.required_item_id)?n.jsxs("label",{children:[n.jsx("span",{children:"ID del objeto requerido"}),n.jsx("input",{value:String(e.required_item_id||""),onChange:g=>t({required_item_id:g.target.value,requires_item:!!g.target.value})})]}):null,e.required_item_id?n.jsxs("label",{className:"checkbox wide",children:[n.jsx("input",{checked:!!e.consume_required_item,type:"checkbox",onChange:g=>t({consume_required_item:g.target.checked})}),n.jsx("span",{children:"Consumir objeto al acceder (se retira de la mochila)"})]}):null]})]}):null,N==="config"?n.jsxs("section",{className:"saga-guided-v4-page",children:[n.jsxs("div",{className:"saga-guided-v4-pagehead",children:[n.jsx("span",{children:"Paso 2 de 3"}),n.jsx("h3",{children:"⚙️ Ajustes y Recompensas del Nodo"}),n.jsx("p",{children:"Personaliza el título, las reglas del juego y lo que entrega al completarse."})]}),n.jsxs("div",{className:"saga-guided-v4-formgrid",children:[b==="game"?n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Título visible del nodo / juego"}),n.jsx("input",{value:String(e.title||""),onChange:g=>t({title:g.target.value})})]}):b==="map_collectible"?n.jsxs(n.Fragment,{children:[n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"🎁 Objeto que entrega este nodo en el mapa"}),n.jsxs("select",{value:["placa_base","cables_cobre","bateria_litio","cinta_aislante","llave_rota"].includes(e.physical_item_id||"")?e.physical_item_id||"placa_base":"custom",onChange:g=>{const x=g.target.value;if(x==="custom")t({physical_item_id:"objeto_personalizado",physical_item_label:"Objeto Personalizado",config:{...h,collectible_purpose:"standalone"}});else{const A={placa_base:"Placa base",cables_cobre:"Cables de cobre",bateria_litio:"Batería de litio",cinta_aislante:"Cinta aislante",llave_rota:"Llave rota"},T={placa_base:"crafting",cables_cobre:"crafting",bateria_litio:"crafting",cinta_aislante:"crafting",llave_rota:"crafting"};t({physical_item_id:x,physical_item_label:A[x],config:{...h,collectible_purpose:T[x]||"standalone"}})}},children:[n.jsx("option",{value:"placa_base",children:"💾 Placa base → ingrediente EMP"}),n.jsx("option",{value:"cables_cobre",children:"🔌 Cables de cobre → ingrediente EMP"}),n.jsx("option",{value:"bateria_litio",children:"🔋 Batería de litio → ingrediente EMP"}),n.jsx("option",{value:"cinta_aislante",children:"🩹 Cinta aislante → ingrediente Llave Maestra"}),n.jsx("option",{value:"llave_rota",children:"🔑 Llave rota → ingrediente Llave Maestra"}),n.jsx("option",{value:"custom",children:"✏️ Objeto personalizado"})]})]}),["placa_base","cables_cobre","bateria_litio","cinta_aislante","llave_rota"].includes(e.physical_item_id||"")?null:n.jsxs(n.Fragment,{children:[n.jsxs("label",{children:[n.jsx("span",{children:"Nombre visible"}),n.jsx("input",{value:Kt(e),onChange:g=>t({physical_item_label:g.target.value,title:g.target.value})})]}),n.jsxs("label",{children:[n.jsx("span",{children:"ID interno"}),n.jsx("input",{value:sn(e),onChange:g=>t({physical_item_id:Ln(g.target.value)})})]})]})]}):n.jsxs(n.Fragment,{children:[n.jsxs("label",{children:[n.jsx("span",{children:"Título interno del QR"}),n.jsx("input",{value:String(e.title||""),onChange:g=>t({title:g.target.value})})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"🎁 Objeto que entrega al escanear"}),n.jsxs("select",{value:["placa_base","cables_cobre","bateria_litio","cinta_aislante","llave_rota"].includes(e.physical_item_id||"")?e.physical_item_id||"placa_base":"custom",onChange:g=>{const x=g.target.value;if(x==="custom")t({physical_item_id:"objeto_personalizado",physical_item_label:"Objeto Personalizado",title:"Objeto Personalizado",config:{...h,collectible_purpose:"standalone"}});else{const A={placa_base:"Placa base",cables_cobre:"Cables de cobre",bateria_litio:"Batería de litio",cinta_aislante:"Cinta aislante",llave_rota:"Llave rota"},T={placa_base:"crafting",cables_cobre:"crafting",bateria_litio:"crafting",cinta_aislante:"crafting",llave_rota:"crafting"};t({physical_item_id:x,physical_item_label:A[x],title:A[x],config:{...h,collectible_purpose:T[x]||"standalone"}})}},children:[n.jsx("option",{value:"placa_base",children:"💾 Placa base → ingrediente EMP"}),n.jsx("option",{value:"cables_cobre",children:"🔌 Cables de cobre → ingrediente EMP"}),n.jsx("option",{value:"bateria_litio",children:"🔋 Batería de litio → ingrediente EMP"}),n.jsx("option",{value:"cinta_aislante",children:"🩹 Cinta aislante → ingrediente Llave Maestra"}),n.jsx("option",{value:"llave_rota",children:"🔑 Llave rota → ingrediente Llave Maestra"}),n.jsx("option",{value:"custom",children:"✏️ Objeto personalizado"})]})]}),["placa_base","cables_cobre","bateria_litio","cinta_aislante","llave_rota"].includes(e.physical_item_id||"")?null:n.jsxs(n.Fragment,{children:[n.jsxs("label",{children:[n.jsx("span",{children:"Nombre visible"}),n.jsx("input",{value:Kt(e),onChange:g=>t({physical_item_label:g.target.value,title:g.target.value})})]}),n.jsxs("label",{children:[n.jsx("span",{children:"ID interno"}),n.jsx("input",{value:sn(e),onChange:g=>t({physical_item_id:Ln(g.target.value)})})]})]})]}),b!=="map_collectible"&&b!=="qr"?n.jsxs(n.Fragment,{children:[n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"🎁 ¿Entrega algún objeto de regalo al superar el juego?"}),n.jsxs("select",{value:["placa_base","cables_cobre","bateria_litio","cinta_aislante","llave_rota"].includes(((De=e.config)==null?void 0:De.reward_item_id)||"")?((Se=e.config)==null?void 0:Se.reward_item_id)||"placa_base":(Xe=e.config)!=null&&Xe.reward_item_id?"custom":"none",onChange:g=>{const x=g.target.value;if(x==="none")t({config:{...h,reward_item_id:"",reward_item_label:"",reward_message:""}});else if(x==="custom")t({config:{...h,reward_item_id:"objeto_recompensa",reward_item_label:"Objeto Recompensa",reward_message:"¡Has recibido un objeto!"}});else{const A={placa_base:"Placa base",cables_cobre:"Cables de cobre",bateria_litio:"Batería de litio",cinta_aislante:"Cinta aislante",llave_rota:"Llave rota"};t({config:{...h,reward_item_id:x,reward_item_label:A[x],reward_message:`¡Has recibido: ${A[x]}!`}})}},children:[n.jsx("option",{value:"none",children:"🟢 Ninguno"}),n.jsx("option",{value:"placa_base",children:"💾 Placa base"}),n.jsx("option",{value:"cables_cobre",children:"🔌 Cables de cobre"}),n.jsx("option",{value:"bateria_litio",children:"🔋 Batería de litio"}),n.jsx("option",{value:"cinta_aislante",children:"🩹 Cinta aislante"}),n.jsx("option",{value:"llave_rota",children:"🔑 Llave rota"}),n.jsx("option",{value:"custom",children:"✏️ Otro objeto..."})]})]}),(Oe=e.config)!=null&&Oe.reward_item_id&&!["placa_base","cables_cobre","bateria_litio","cinta_aislante","llave_rota"].includes((te=e.config)==null?void 0:te.reward_item_id)?n.jsxs(n.Fragment,{children:[n.jsxs("label",{children:[n.jsx("span",{children:"Nombre recompensa"}),n.jsx("input",{value:String(((lt=e.config)==null?void 0:lt.reward_item_label)||""),onChange:g=>t({config:{...h,reward_item_label:g.target.value}})})]}),n.jsxs("label",{children:[n.jsx("span",{children:"ID recompensa"}),n.jsx("input",{value:String(((Ye=e.config)==null?void 0:Ye.reward_item_id)||""),onChange:g=>t({config:{...h,reward_item_id:Ln(g.target.value)}})})]})]}):null,((Ke=e.config)==null?void 0:Ke.reward_item_id)&&n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Mensaje al recibir recompensa"}),n.jsx("input",{value:String(((tt=e.config)==null?void 0:tt.reward_message)||""),onChange:g=>t({config:{...h,reward_message:g.target.value}})})]})]}):null,b==="game"?n.jsxs(n.Fragment,{children:[Ue.map(g=>{var A;const x=Tr[g]||{label:g,help:"Ajuste avanzado",type:"text"};return g==="completion_method"?null:n.jsxs("label",{className:g==="objective"?"wide":"",children:[n.jsx("span",{children:x.label}),x.type==="select"?n.jsx("select",{value:g==="difficulty"?cd(h[g]):so(h[g]),onChange:T=>je(g,T.target.value),children:(A=x.options)==null?void 0:A.map(T=>n.jsx("option",{value:T.value,children:T.label},T.value))}):n.jsx("input",{type:x.type==="number"?"number":"text",value:so(h[g]),onChange:T=>je(g,T.target.value)}),n.jsx("small",{children:x.help})]},g)}),v.id==="logic_circuit"&&n.jsx("div",{className:"wide saga-guided-v4-custom-editor",children:n.jsx(Sc,{config:h,onChange:g=>t({config:{...h,...g}})},v.id)}),v.id==="spark_radar"&&n.jsx("div",{className:"wide saga-guided-v4-custom-editor",children:n.jsx(Hc,{config:h,onChange:g=>t({config:{...h,...g}})},v.id)}),v.id==="tilt_maze"&&n.jsx("div",{className:"wide saga-guided-v4-custom-editor",children:n.jsx(Bc,{config:h,onChange:g=>t({config:{...h,...g}})},v.id)}),v.id==="place_mosaic"&&n.jsx("div",{className:"wide saga-guided-v4-custom-editor",children:n.jsx(Tc,{config:h,onChange:g=>t({config:{...h,...g}})},v.id)}),v.id==="sequence_code"&&n.jsx("div",{className:"wide saga-guided-v4-custom-editor",children:n.jsx(Ec,{config:h,onChange:g=>t({config:{...h,...g}})},v.id)})]}):null]})]}):null,N==="content"?n.jsxs("section",{className:"saga-guided-v4-page",children:[n.jsxs("div",{className:"saga-guided-v4-pagehead",children:[n.jsx("span",{children:"Paso 3 de 3"}),n.jsx("h3",{children:"📜 Historia, Pistas y Ayuda"}),n.jsx("p",{children:"Redacta la narrativa que leerá el jugador y las pistas de rescate."})]}),n.jsxs("div",{className:"saga-guided-v4-formgrid",children:[b==="game"&&n.jsxs(n.Fragment,{children:[n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Título del Prólogo / Historia"}),n.jsx("input",{value:String(e.intro_title||""),onChange:g=>t({intro_title:g.target.value}),placeholder:"Ej: El Antiguo Manuscrito..."})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Texto del Prólogo (Narrativa)"}),n.jsx("textarea",{value:String(e.intro_body||""),onChange:g=>t({intro_body:g.target.value}),rows:3,placeholder:"Texto introductorio antes de jugar..."})]})]}),b==="qr"?n.jsxs("div",{className:"wide",children:[n.jsx(Bd,{payload:xn(e),label:Kt(e),itemId:sn(e),typeLabel:f.title,design:C,validationSignature:String(h.qr_validation_signature||""),onDesignChange:g=>t({config:{...h,qr_card_preset:g.preset,qr_card_shape:g.shape,qr_card_accent:g.accent,qr_card_image_data_url:g.imageDataUrl,qr_validation_signature:"",qr_validated_at:""}}),onValidated:g=>t({config:{...h,qr_validation_signature:g,qr_validated_at:new Date().toISOString()}}),onApply:qe}),n.jsxs("label",{style:{marginTop:12},children:[n.jsx("span",{children:"Payload QR (Código codificado)"}),n.jsx("input",{value:xn(e),onChange:g=>t({qr_payload:g.target.value})})]})]}):n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Texto explicativo / Descripción del nodo"}),n.jsx("textarea",{value:String(e.content||e.description||e.body||v.content||""),onChange:g=>t({content:g.target.value,description:g.target.value,body:g.target.value}),rows:4})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"💡 Pista del juego (si el jugador se atasca)"}),n.jsx("textarea",{value:Wa((gt=e.messages)==null?void 0:gt.hint,v.messages.hint),onChange:g=>t({messages:{...e.messages||{},hint:g.target.value}}),rows:2})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Texto “Sin cobertura GPS”"}),n.jsx("textarea",{value:Wa((Et=e.messages)==null?void 0:Et.gps_unavailable,v.messages.gps_unavailable),onChange:g=>t({messages:{...e.messages||{},gps_unavailable:g.target.value}}),rows:2})]}),n.jsxs("label",{children:[n.jsx("span",{children:"Texto “Acceso Bloqueado”"}),n.jsx("textarea",{value:Wa((me=e.messages)==null?void 0:me.locked,v.messages.locked),onChange:g=>t({messages:{...e.messages||{},locked:g.target.value}}),rows:2})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"🎉 Mensaje de éxito al completar"}),n.jsx("textarea",{value:String(e.success_message||"¡Bien hecho! Has desbloqueado la siguiente pista."),onChange:g=>t({success_message:g.target.value}),rows:2})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"🆘 Código SAGA de emergencia (Fallback)"}),n.jsx("input",{value:Yn(e),onChange:g=>t({fallback_code:g.target.value,physical_fallback_code:g.target.value,config:{...h,success_code:g.target.value}})}),n.jsx("small",{children:"Permite superar el nodo introduciendo este código manualmente si falla el GPS o la cámara."})]})]})]}):null]}),n.jsxs("footer",{className:"saga-guided-v4-footer",children:[n.jsx("button",{type:"button",onClick:_e,disabled:l===0,children:"Atrás"}),n.jsx("button",{type:"button",className:"secondary",onClick:()=>{r?r():t({_type_choice_done:!1})},children:"Cambiar tipo"}),l<rn.length-1?n.jsx("button",{type:"button",className:"primary",onClick:ee,children:"Siguiente"}):n.jsx("button",{type:"button",className:"primary",onClick:Fe,children:"Listo"})]})]})}function Qc({stage:e,onPatch:t,onClose:a,onDelete:i,onRequestChangeType:r,stages:o=[]}){Wt(e);const l=S.useMemo(()=>o.filter(p=>{var y,b;return p.id===e.id?!1:!!(p.physical_item_id??((y=p.physical_qr)==null?void 0:y.item_id)??((b=p.config)==null?void 0:b.physical_item_id)??"")}).map(p=>{var w,f,v,N;const m=p.physical_item_id??((w=p.physical_qr)==null?void 0:w.item_id)??((f=p.config)==null?void 0:f.physical_item_id)??"",y=p.physical_item_label??((v=p.physical_qr)==null?void 0:v.label)??p.title??`Nodo ${p.index+1}`,b=p.physical_node_kind==="collectible"||p.is_map_collectible||(N=p.config)!=null&&N.is_map_collectible?"🎁":"🔑";return{id:m,label:`${b} ${y} (del Nodo ${p.index+1})`}}),[o,e.id]),d=S.useMemo(()=>o.filter(p=>p.id!==e.id).map(p=>({id:p.id,label:`Nodo ${p.index+1}: ${p.title??"Sin título"}`})),[o,e.id]),s=!!(e.required_item_id&&e.requires_item!==!1),c=s&&!["llave_maestra","emp_device"].includes(e.required_item_id)&&!l.some(p=>p.id===e.required_item_id),u=!!e.target_node_id;return e.reward_item_id,n.jsxs("div",{className:"saga-guided-v4-scroll-view",children:[n.jsxs("header",{className:"saga-guided-v4-header",children:[n.jsxs("div",{className:"saga-guided-v4-titleblock",children:[n.jsx("span",{children:"COLECCIONABLE DE MAPA"}),n.jsx("input",{value:e.title||e.physical_item_label||"",onChange:p=>t({title:p.target.value,physical_item_label:p.target.value}),placeholder:"Objeto Coleccionable",style:{background:"transparent",border:"none",borderBottom:"2px dashed rgba(255,255,255,0.2)",color:"#fff",fontSize:"22px",fontWeight:800,padding:"2px 0",margin:"4px 0",outline:"none",width:"100%",fontFamily:"inherit"}}),n.jsxs("div",{className:"saga-guided-v4-chips",children:[n.jsx("b",{children:"⭐ Coleccionable"}),n.jsx("b",{children:"Jugable"}),n.jsx("b",{children:"Offline listo"}),e.lat!=null&&e.lon!=null?n.jsxs("b",{children:[Number(e.lat).toFixed(5),", ",Number(e.lon).toFixed(5)]}):null]})]}),n.jsxs("div",{className:"saga-guided-v4-actions",children:[n.jsx("button",{type:"button",className:"primary-soft",onClick:()=>{r?r():t({_type_choice_done:!1})},children:"Cambiar tipo"}),n.jsx("button",{type:"button",className:"danger",onClick:i,children:"Eliminar"}),n.jsx("button",{type:"button",onClick:a,children:"Cerrar ×"})]})]}),n.jsxs("div",{className:"saga-guided-v4-page",style:{paddingTop:20},children:[n.jsxs("div",{className:"saga-guided-v4-pagehead",children:[n.jsx("span",{children:"Coleccionable de Mapa"}),n.jsx("h3",{children:"Configura tu objeto coleccionable"}),n.jsx("p",{children:"Los jugadores recogerán este objeto automáticamente al acercarse con su GPS. A diferencia de los nodos normales, no requiere jugar a un minijuego, solo estar en la ubicación."})]}),n.jsxs("div",{className:"saga-guided-v4-formgrid",children:[n.jsxs("div",{className:"saga-guided-v4-dep-box wide",children:[n.jsx("div",{className:"saga-guided-v4-dep-box__title",children:"📋 Datos del objeto"}),n.jsx("p",{className:"saga-guided-v4-dep-box__desc",children:"Cómo se verá este coleccionable en la mochila del jugador."}),n.jsxs("label",{children:[n.jsx("span",{children:"ID interno (para lógica)"}),n.jsx("input",{type:"text",value:e.physical_item_id||"",onChange:p=>t({physical_item_id:p.target.value}),placeholder:"Ej. bateria_1, reliquia"}),n.jsx("small",{children:"Usa minúsculas sin espacios. Este ID servirá si otro nodo requiere este objeto."})]}),n.jsxs("label",{className:"wide",style:{marginTop:12},children:[n.jsx("span",{children:"Historia / Introducción (Opcional)"}),n.jsx("input",{type:"text",value:e.intro_title||"",onChange:p=>t({intro_title:p.target.value}),placeholder:"Título de la historia",style:{marginBottom:8}}),n.jsx("textarea",{value:e.intro_body||"",onChange:p=>t({intro_body:p.target.value}),placeholder:"Escribe la narrativa que leerá el jugador ANTES de recoger el objeto. Soporta Markdown para imágenes: ![alt](url).",rows:3})]}),n.jsxs("label",{className:"wide",style:{marginTop:12},children:[n.jsx("span",{children:"Mensaje al recoger"}),n.jsx("textarea",{value:e.content||"",onChange:p=>t({content:p.target.value,description:p.target.value}),placeholder:"¡Has encontrado una reliquia!",rows:3})]})]}),n.jsxs("div",{className:"saga-guided-v4-dep-box wide",children:[n.jsx("div",{className:"saga-guided-v4-dep-box__title",children:"🔒 ¿Requiere un objeto previo?"}),n.jsx("p",{className:"saga-guided-v4-dep-box__desc",children:"El jugador no podrá recoger este objeto si no tiene antes otro específico en la mochila."}),n.jsxs("select",{value:s?c?"custom":e.required_item_id:"none",onChange:p=>{const m=p.target.value;t(m==="none"?{required_item_id:"",requires_item:!1}:m==="custom"?{required_item_id:"item_requerido",requires_item:!0}:{required_item_id:m,requires_item:!0})},children:[n.jsx("option",{value:"none",children:"🟢 Libre: cualquier jugador puede acceder"}),n.jsx("option",{value:"llave_maestra",children:"🔑 Requiere Llave Maestra"}),n.jsx("option",{value:"emp_device",children:"⚡ Requiere Dispositivo EMP"}),n.jsx("option",{value:"decodificador_cuantico",children:"💻 Requiere Decodificador Cuántico"}),n.jsx("option",{value:"escaner_biometrico",children:"🔬 Requiere Escáner Biométrico"}),n.jsx("option",{value:"amuleto_guardian",children:"🛡️ Requiere Amuleto del Guardián"}),n.jsx("option",{value:"elixir_alquimia",children:"🧪 Requiere Elixir de Alquimia"}),n.jsx("option",{value:"escudo_runico",children:"🛡️ Requiere Escudo Rúnico"}),n.jsx("option",{value:"orbe_fuego",children:"🔮 Requiere Orbe de Fuego Arcano"}),n.jsx("option",{value:"reliquia_sagrada",children:"🏛️ Requiere Reliquia Sagrada"}),n.jsx("option",{value:"amuleto_vision",children:"👁️ Requiere Amuleto de Visión"}),l.map(p=>n.jsx("option",{value:p.id,children:p.label},p.id)),n.jsx("option",{value:"custom",children:"✏️ Otro ID personalizado..."})]}),c&&n.jsxs("label",{children:[n.jsx("span",{children:"ID del objeto requerido"}),n.jsx("input",{type:"text",value:e.required_item_id,onChange:p=>t({required_item_id:p.target.value}),placeholder:"Ej. tarjeta_roja"})]})]}),n.jsxs("div",{className:"saga-guided-v4-dep-box wide",children:[n.jsx("div",{className:"saga-guided-v4-dep-box__title",children:"📍 Conectar con otro nodo"}),n.jsx("p",{className:"saga-guided-v4-dep-box__desc",children:"Si recoges este objeto, el mapa trazará una línea conectando con el nodo destino. Útil para indicar dónde se debe usar el objeto."}),n.jsxs("label",{className:"saga-guided-v4-check-field",children:[n.jsx("input",{type:"checkbox",checked:u,onChange:p=>{var m;p.target.checked?t({target_node_id:((m=d[0])==null?void 0:m.id)||""}):t({target_node_id:null})}}),n.jsx("span",{children:"Mostrar línea hacia otro nodo"})]}),u&&n.jsxs("select",{value:e.target_node_id||"",onChange:p=>t({target_node_id:p.target.value}),children:[n.jsx("option",{value:"",children:"Selecciona un nodo destino"}),d.map(p=>n.jsx("option",{value:p.id,children:p.label},p.id))]})]})]})]})]})}function Vc({stage:e,onPatch:t,onClose:a,onDelete:i,onRequestChangeType:r,stages:o=[]}){const l=Wt(e),d=e.physical_node_kind??"collectible",s=e.physical_qr&&typeof e.physical_qr=="object"?e.physical_qr:{},c=String(e.physical_item_label??s.label??e.title??"Objeto SAGA"),u=String(e.physical_item_id??s.item_id??""),p=String(e.qr_payload??s.payload??"");function m(y){const b=y.label??c,w=y.itemId??u,f=y.payload??p;t({physical_node_kind:d,physical_item_kind:d,physical_item_label:b,physical_item_id:w,qr_payload:f,physical_qr:{item_id:w,label:b,kind:d,payload:f,card_text:`⭐ ${b}
Objeto QR
Escanea esta tarjeta en SAGA.`,updated_at:new Date().toISOString()}})}return n.jsxs("div",{className:"saga-guided-v4-scroll-view",children:[n.jsxs("header",{className:"saga-guided-v4-header",children:[n.jsxs("div",{className:"saga-guided-v4-titleblock",children:[n.jsx("span",{children:"QR FÍSICO"}),n.jsx("input",{value:e.title??e.physical_item_label??"",onChange:y=>t({title:y.target.value,physical_item_label:y.target.value}),placeholder:"Objeto Escaneable",style:{background:"transparent",border:"none",borderBottom:"2px dashed rgba(255,255,255,0.2)",color:"#fff",fontSize:"22px",fontWeight:800,padding:"2px 0",margin:"4px 0",outline:"none",width:"100%",fontFamily:"inherit"}}),n.jsxs("div",{className:"saga-guided-v4-chips",children:[n.jsx("b",{children:"▣ QR Físico"}),n.jsx("b",{children:"Jugable"}),n.jsx("b",{children:"Offline listo"}),e.lat!=null&&e.lon!=null?n.jsxs("b",{children:[Number(e.lat).toFixed(5),", ",Number(e.lon).toFixed(5)]}):null]})]}),n.jsxs("div",{className:"saga-guided-v4-actions",children:[n.jsx("button",{type:"button",className:"primary-soft",onClick:()=>{r?r():t({_type_choice_done:!1})},children:"Cambiar tipo"}),n.jsx("button",{type:"button",className:"danger",onClick:i,children:"Eliminar"}),n.jsx("button",{type:"button",onClick:a,children:"Cerrar ×"})]})]}),n.jsxs("div",{className:"saga-guided-v4-page",style:{paddingTop:20},children:[n.jsxs("div",{className:"saga-guided-v4-pagehead",children:[n.jsx("span",{children:"QR Físico"}),n.jsx("h3",{children:"Configura tu objeto escaneable"}),n.jsx("p",{children:"Esta tarjeta se debe imprimir y esconder en el mundo real. El jugador usará la cámara SAGA para escanearla."})]}),n.jsxs("div",{className:"saga-guided-v4-formgrid",children:[n.jsxs("div",{className:"saga-guided-v4-dep-box wide",children:[n.jsx("div",{className:"saga-guided-v4-dep-box__title",children:"🖼️ Datos del QR"}),n.jsx("p",{className:"saga-guided-v4-dep-box__desc",children:"El código de abajo es exactamente el que se imprime y el que debe leer la cámara. Si ya tienes las pegatinas impresas, escribe aquí el mismo texto que llevan."}),n.jsxs("div",{style:{display:"flex",gap:18,flexWrap:"wrap",padding:"0 12px 12px",alignItems:"flex-start"},children:[n.jsx("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:16,background:"#ffffff",border:"1px dashed #cbd5e1",borderRadius:16},children:p?n.jsxs(n.Fragment,{children:[n.jsx(Ai,{payload:p,size:150}),n.jsx("div",{style:{color:"#007f4f",fontSize:13,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.08em",border:"2px solid #007f4f",borderRadius:20,padding:"3px 20px",textAlign:"center"},children:c})]}):n.jsx("span",{style:{color:"#64748b",fontSize:12,fontWeight:700,padding:40},children:"Escribe un código para generar el QR"})}),n.jsxs("div",{style:{flex:1,minWidth:240,display:"grid",gap:10},children:[n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Código del QR (lo que lleva impreso)"}),n.jsx("input",{type:"text",value:p,onChange:y=>m({payload:y.target.value.trim()}),placeholder:"Ej. CODIGO_01"})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Nombre visible del objeto"}),n.jsx("input",{type:"text",value:c,onChange:y=>m({label:y.target.value}),placeholder:"Ej. Antena de Frecuencia"})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"ID interno (lo que entra en la mochila)"}),n.jsx("input",{type:"text",value:u,onChange:y=>m({itemId:Ln(y.target.value)}),placeholder:"Ej. antena_frecuencia"})]}),n.jsx("p",{style:{margin:0,color:"#fbbf24",fontSize:11,fontWeight:700,lineHeight:1.4},children:"⚠️ Si cambias el código, las pegatinas ya impresas dejarán de funcionar. Reimprímelas desde el botón de imprimir QRs."})]})]})]}),n.jsxs("div",{className:"saga-guided-v4-dep-box wide",children:[n.jsx("div",{className:"saga-guided-v4-dep-box__title",children:"📖 Historia / Introducción (Opcional)"}),n.jsx("p",{className:"saga-guided-v4-dep-box__desc",children:"Texto que se mostrará al jugador ANTES de indicarle que escanee el QR."}),n.jsxs("div",{style:{padding:"0 12px 12px"},children:[n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Título de la historia"}),n.jsx("input",{type:"text",value:e.intro_title||"",onChange:y=>t({intro_title:y.target.value}),placeholder:"Ej: El cofre secreto",style:{marginBottom:8}})]}),n.jsxs("label",{className:"wide",children:[n.jsx("span",{children:"Narrativa previa"}),n.jsx("textarea",{value:e.intro_body||"",onChange:y=>t({intro_body:y.target.value}),placeholder:"Soporta Markdown para imágenes: ![alt](url).",rows:3})]})]})]}),n.jsxs("div",{className:"saga-guided-v4-dep-box wide",children:[n.jsx("div",{className:"saga-guided-v4-dep-box__title",children:"🆘 Código de Emergencia (Fallback)"}),n.jsx("p",{className:"saga-guided-v4-dep-box__desc",children:"Si la cámara del jugador falla o el QR se rompe, el jugador puede escribir este código manualmente."}),n.jsxs("label",{children:[n.jsx("span",{children:"Código Alfanumérico Corto"}),n.jsx("input",{type:"text",value:String(l.success_code??l.fallback_code??`SAGA-${String(e.index+1).padStart(2,"0")}`),onChange:y=>{const b=y.target.value.trim().toUpperCase();t({fallback_code:b,physical_fallback_code:b,config:{...l,success_code:b}})},placeholder:"Ej. SAGA-12"})]})]})]})]})]})}function ol({stage:e,onPatch:t,onClose:a,onDelete:i,onRequestChangeType:r,stages:o=[]}){var s;const[l,d]=S.useState(()=>Fn(e)?"map_collectible":ya(e)?"qr":"game");return S.useEffect(()=>{d(Fn(e)?"map_collectible":ya(e)?"qr":"game")},[e.id,e.index,e.type,(s=e.config)==null?void 0:s.is_map_collectible,e.physical_node_kind,e.entry_mode,e.game_type,e.game_template_id]),n.jsx("div",{className:"saga-guided-v4-flow-container",children:l==="map_collectible"?n.jsx(Qc,{stage:e,onPatch:t,stages:o,onClose:a,onDelete:i,onRequestChangeType:r}):l==="qr"?n.jsx(Vc,{stage:e,onPatch:t,stages:o,onClose:a,onDelete:i,onRequestChangeType:r}):n.jsx(Wc,{stage:e,onPatch:t,onClose:a,onDelete:i,onRequestChangeType:r,stages:o})})}function Uc(e){return e.runtimeStatus==="runtime_ready"&&e.offlineStatus==="offline_ready"}function Kc(e){return Ge.filter(t=>Uc(t)||t.id===e)}function Jc(e,t){return typeof e!="number"||typeof t!="number"?"No coordinates":`${e.toFixed(5)}, ${t.toFixed(5)}`}function Yc(e){return e.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)}function Zc(e){var w,f,v,N,h;const t=e,a=typeof e.config=="object"&&e.config!==null?e.config||{}:{},i=typeof a.game_id=="string"?a.game_id:"",r=String(t.label||e.title||"").toLowerCase(),o=String(e.title||"").toLowerCase(),l=String(t.qr_payload||((w=t.physical_qr)==null?void 0:w.item_id)||((f=t.physical_qr)==null?void 0:f.label)||"").toLowerCase(),d=String(i||a.game_title||a.objective||"").toLowerCase(),s=`${r} ${o} ${l} ${d}`,c=i==="qr_collectible"?"collectible":i==="qr_key_gate"?"requirement":i==="clue_card"?"clue":i==="bonus_cache"?"bonus":"",u=/llave|key|qr_key|requirement/.test(s)?"requirement":/pista|clue/.test(s)?"clue":/bonus|regalo|cache/.test(s)?"bonus":/objeto|coleccionable|collectible|qr/.test(s)?"collectible":"",p=t.physical_node_kind||t.physical_item_kind||((v=t.physical_qr)==null?void 0:v.kind)||c||u;if(p!=="collectible"&&p!=="requirement"&&p!=="clue"&&p!=="bonus")return null;const m=String(e.title||`Nodo ${e.index+1}`).trim(),y=String(t.physical_item_label||((N=t.physical_qr)==null?void 0:N.label)||a.physical_item_label||a.game_title||t.label||(p==="requirement"?"Llave QR":p==="clue"?"Pista QR":p==="bonus"?"Bonus QR":"Coleccionable")).trim(),b=String(t.physical_item_id||((h=t.physical_qr)==null?void 0:h.item_id)||a.physical_item_id||Yc(y||m)||`node_${e.index+1}`).trim();return{itemId:b,label:m||y||b,title:y&&y!==m?`${m} · ${y}`:m,kind:p,icon:p==="collectible"?"⭐":p==="requirement"?"🔑":p==="clue"?"🧩":"🎁"}}function Xc({stage:e,stages:t=[],onClose:a,onApplyLocal:i,onDeleteLocal:r,onRequestChangeType:o}){const[l,d]=S.useState(e);function s(h){const C={...l,...h};d(C),i(C)}const[c,u]=S.useState("basics"),[p,m]=S.useState(!1);S.useEffect(()=>{d(e),u("basics")},[e.id,e.index]);const y=ba.find(h=>h.id===l.type)||ba[0];l.messages;const b=typeof l.id=="string"&&l.id.startsWith("local-"),w=typeof l.config=="object"&&l.config!==null?l.config||{}:{};t.filter(h=>h.index!==l.index).map(Zc).filter(h=>!!h).find(h=>h.itemId===N("required_item_id"));const v=$r(l.type,w);Kc(v.id);function N(h,C=""){const z=w[h];return Array.isArray(z)?z.join(", "):typeof z=="number"||typeof z=="string"||typeof z=="boolean"?String(z):C}return n.jsx("div",{className:"admin-drawer-overlay admin-drawer-overlay--nonblocking",role:"region",children:n.jsxs("aside",{className:"admin-drawer admin-drawer-editable admin-node-editor-redesign admin-node-editor-large-modal admin-guided-v4-shell",role:"dialog","aria-label":`Node editor: ${l.title}`,onClick:h=>h.stopPropagation(),children:[n.jsxs("div",{className:"admin-node-editor-inline-topbar",children:[n.jsxs("div",{className:"admin-node-editor-inline-title",children:[n.jsx("span",{className:"admin-node-editor-inline-kicker",children:"Editor"}),n.jsx("strong",{children:"Editor guiado de nodo / QR físico"})]}),n.jsx("button",{type:"button",className:"admin-node-editor-inline-close",onClick:a,"aria-label":"Cerrar editor de nodo",children:"Cerrar ×"})]}),n.jsxs("div",{className:"admin-drawer-head admin-drawer-head--modern admin-node-editor-topbar",children:[n.jsxs("div",{className:"admin-node-editor-kicker-row",children:[n.jsx("span",{className:"admin-kicker",children:b?"Añadir nodo":"Editor guiado de nodo"}),n.jsx("button",{type:"button",className:"admin-node-editor-close",onClick:a,children:"Cerrar ×"})]}),n.jsxs("div",{className:"admin-node-editor-title-row",children:[n.jsxs("div",{className:"admin-node-editor-title-copy",children:[n.jsxs("h2",{children:[n.jsxs("span",{style:{opacity:.65,marginRight:8},children:["#",l.index+1]}),l.title?l.title.replace(/^\d+\.\s*/,""):"Nodo sin título"]}),n.jsxs("div",{className:"admin-drawer-meta admin-node-editor-meta",children:[n.jsxs("span",{children:[(y==null?void 0:y.icon)||"◇"," ",l.label||l.type]}),n.jsx("span",{children:Jc(l.lat,l.lon)}),n.jsx("span",{children:typeof l.radius=="number"?`${l.radius} m`:"Sin radio"})]})]}),n.jsxs("div",{className:"admin-node-editor-actions",children:[n.jsx("button",{type:"button",onClick:o,children:"Cambiar tipo"}),n.jsx("button",{type:"button",className:"admin-node-delete-visible",onClick:()=>{window.confirm(`Eliminar nodo "${l.title||"Sin título"}"? Guarda después para persistir.`)&&r(l)},children:"Eliminar"})]})]})]}),n.jsx("div",{className:"admin-drawer-body admin-drawer-body--modern admin-guided-v4-body-host",children:n.jsx(ol,{stage:l,onPatch:s,onClose:a,stages:t,onRequestChangeType:o,onDelete:()=>{window.confirm(`Eliminar nodo "${l.title||"Sin título"}"? Pulsa Guardar después para persistir.`)&&r(l)}})}),n.jsx("div",{className:"admin-drawer-footer",children:n.jsx("div",{className:"admin-drawer-footer-actions",children:n.jsx("button",{type:"button",className:"admin-cms-side-action",onClick:a,children:"Close"})})})]})})}const fo={collectible:"Objeto QR",requirement:"Llave QR",clue:"Pista QR",bonus:"Bonus QR",qr:"QR Físico"},ho={collectible:"⭐",requirement:"🔑",clue:"🧩",bonus:"🎁",qr:"📍"};async function eu(e){try{return await navigator.clipboard.writeText(e),!0}catch{return!1}}function tu(e,t,a="text/plain"){const i=new Blob([t],{type:a}),r=URL.createObjectURL(i),o=document.createElement("a");o.href=r,o.download=e,document.body.appendChild(o),o.click(),o.remove(),URL.revokeObjectURL(r)}function nu({initialLabel:e="Buscar a tu enemigo",initialKind:t,compact:a=!1,hideInputs:i=!1,onSaveToNode:r}){const[o,l]=S.useState(e),[d,s]=S.useState(""),[c,u]=S.useState(null),p=S.useRef(null),m=t;S.useEffect(()=>{l(e||"Buscar a tu enemigo"),s("")},[e,t]);const y=S.useMemo(()=>(d.trim()||o.trim()).toUpperCase().replace(/\s+/g,"_"),[o,d]),b=o.trim()||"Objeto SAGA",w=d.trim()||y,f=`${ho[m]} ${b}
${fo[m]}
Escanea esta tarjeta en SAGA.`;function v(z){u(z),window.setTimeout(()=>u(null),1800)}async function N(z,B){const U=await eu(B);v(U?`${z} copiado`:`No se pudo copiar ${z}`)}function h(){var U;const z=(U=p.current)==null?void 0:U.querySelector("svg");if(!z){v("No se pudo descargar el QR");return}const B=`<?xml version="1.0" encoding="UTF-8"?>
${z.outerHTML}`;tu(`saga-qr-${y}.svg`,B,"image/svg+xml"),v("QR descargado")}function C(){r({item_id:y,label:b,kind:m,payload:w,card_text:f,updated_at:new Date().toISOString()}),v("QR aplicado. Pulsa Guardar para persistir la misión.")}return n.jsxs("section",{style:a?iu:au,"aria-label":"Generador QR del nodo",children:[!a&&n.jsxs("div",{style:ou,children:[n.jsxs("div",{children:[n.jsx("div",{style:ru,children:"TARJETA QR"}),n.jsx("h2",{style:a?lu:rl,children:"QR imprimible"}),n.jsx("p",{style:su,children:"Escanéalo para guardar este objeto físico en la mochila del jugador."})]}),n.jsxs("span",{style:du,children:[ho[m]," ",fo[m]]})]}),n.jsxs("div",{style:cu,children:[n.jsx("div",{style:uu,children:n.jsx("div",{ref:p,style:pu,children:n.jsx(el,{data:{payload:w,label:b}})})}),!i&&n.jsxs("div",{style:mu,children:[n.jsxs("label",{style:bo,children:["Nombre visible",n.jsx("input",{value:o,onChange:z=>l(z.target.value),placeholder:"Buscar a tu enemigo",style:xo})]}),n.jsxs("label",{style:bo,children:["ID interno",n.jsx("input",{value:d,onChange:z=>s(z.target.value),placeholder:y,style:xo})]})]})]}),n.jsxs("div",{style:gu,children:[n.jsx("span",{children:"Payload interno"}),n.jsx("code",{children:w}),n.jsx("small",{children:"Va dentro del QR. Normalmente no se escribe a mano."})]}),n.jsxs("div",{style:fu,children:[n.jsx("button",{type:"button",style:hu,onClick:C,children:"Aplicar QR al nodo"}),n.jsx("button",{type:"button",style:gi,onClick:()=>void N("Payload QR",w),children:"Copiar payload"}),n.jsx("button",{type:"button",style:gi,onClick:h,children:"Descargar QR"})]}),c?n.jsx("div",{style:bu,children:c}):null]})}const au={display:"grid",gap:14},iu={display:"grid",gap:12},ou={display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12},ru={color:"#bbf7d0",fontSize:10,fontWeight:950,letterSpacing:"0.14em",textTransform:"uppercase"},rl={margin:"4px 0 0",color:"#ffffff",fontSize:18,lineHeight:1.05,fontWeight:950,letterSpacing:"-0.04em"},lu={...rl,fontSize:15},su={margin:"7px 0 0",color:"rgba(226,232,240,.74)",fontSize:12,lineHeight:1.42,fontWeight:760},du={minHeight:26,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"0 10px",borderRadius:999,border:"1px solid rgba(187,247,208,.18)",background:"rgba(34,197,94,.12)",color:"#dcfce7",fontSize:10,fontWeight:950,whiteSpace:"nowrap"},cu={display:"grid",gridTemplateColumns:"1fr",gap:12,alignItems:"stretch"},uu={display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"16px"},pu={display:"flex",flexDirection:"column",alignItems:"center",padding:"20px",background:"#ffffff",border:"1px dashed #cbd5e1",borderRadius:"16px",gap:"16px"},mu={display:"flex",flexDirection:"column",gap:16},bo={display:"flex",flexDirection:"column",gap:6,color:"rgba(226,232,240,.7)",fontSize:12,fontWeight:700},xo={width:"100%",height:44,background:"rgba(15,23,42,.4)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:"0 14px",color:"#fff",fontSize:15,fontFamily:"inherit",transition:"border-color .15s"},gu={display:"flex",flexDirection:"column",gap:6,padding:16,background:"rgba(0,0,0,.15)",border:"1px solid rgba(255,255,255,.05)",borderRadius:12,color:"rgba(255,255,255,.5)",fontSize:11},fu={display:"flex",gap:12,marginTop:6},gi={flex:1,height:44,border:"none",borderRadius:12,background:"rgba(255,255,255,.08)",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"},hu={...gi,background:"#10b981",color:"#022c22"},bu={position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#10b981",color:"#064e3b",padding:"8px 16px",borderRadius:20,fontSize:13,fontWeight:700,boxShadow:"0 8px 24px rgba(16,185,129,.4)",animation:"fadeUp 0.2s ease-out"},ll=[{id:"collectible",label:"Coleccionable",help:"Objeto físico que se recoge",icon:"⭐"},{id:"requirement",label:"Llave QR",help:"Objeto que puede desbloquear otro nodo",icon:"🔑"},{id:"clue",label:"Pista QR",help:"Tarjeta física con pista",icon:"🧩"},{id:"bonus",label:"Bonus QR",help:"Extra o recompensa física",icon:"🎁"}];function xu(e){const t=e,a=t.config&&typeof t.config=="object"?t.config:{};if(a.game_id==="simple_checkpoint"||t.game_type==="simple_checkpoint"||t.game_template_id==="simple_checkpoint")return"none";if(a.is_map_collectible||t.is_map_collectible)return"map_collectible";const i=t.physical_node_kind||t.physical_item_kind;if(i==="collectible"&&!t.physical_qr&&!t.qr_payload)return"map_collectible";if(i==="collectible"||i==="requirement"||i==="clue"||i==="bonus")return i;const r=t.physical_qr;if(r&&typeof r=="object"){const o=r.kind;if(o==="collectible"||o==="requirement"||o==="clue"||o==="bonus")return o}return"none"}function yo(e){const t={...e};delete t.physical_node_kind,delete t.physical_qr,delete t.qr_payload,delete t.physical_item_id,delete t.physical_item_label,delete t.physical_item_kind,delete t.is_map_collectible;const a=t.config&&typeof t.config=="object"?{...t.config}:{};return delete a.is_map_collectible,delete a.physical_item_id,delete a.physical_item_label,delete a.game_id,delete a.game_title,delete a.success_code,delete a.fallback_code,t.config=a,t._type_choice_done=!0,t._clear_physical_fields=!0,t}function yu(e,t){const a=e[t];return typeof a=="string"?a:""}function fi(e){const t=e;return t.config&&typeof t.config=="object"&&!Array.isArray(t.config)?t.config:{}}function jn(e){const t=fi(e),a=String(t.success_code||t.fallback_code||"").trim().toUpperCase();if(a)return a;const i=typeof e.index=="number"?e.index+1:1;return`SAGA-${String(i).padStart(2,"0")}`}function _o(e){return typeof e=="number"?e.toFixed(5):"Sin GPS"}function _u(e){return e.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)}function vo(e,t){const a=e,i=a.physical_qr&&typeof a.physical_qr=="object"?a.physical_qr:{},r=ll.find(s=>s.id===t),o=String(a.physical_item_label||i.label||e.title||"Objeto SAGA").trim(),l=String(a.physical_item_id||i.item_id||_u(o)||"objeto_saga").trim(),d=i.payload||`SAGA1:ITEM:${l}:${o}`;return{item_id:l,label:o,kind:t,payload:d,card_text:i.card_text||`${(r==null?void 0:r.icon)||"⭐"} ${o}
${(r==null?void 0:r.label)||"Objeto QR"}
Escanea esta tarjeta en SAGA.`,updated_at:i.updated_at||new Date().toISOString()}}function vu({stage:e,onApplyLocal:t,chooserOnly:a=!1,onFinishChoice:i,onRequestChangeType:r,onClose:o,onDeleteLocal:l}){var f,v;const d=xu(e),s=d!=="none",c=typeof e.id=="string"&&e.id.startsWith("local-"),u=typeof e.id=="string"&&e.id.startsWith("local-");function p(){if(!l)return;const N=u?"Descartar":"Eliminar",h=u?"Se quitará de la edición local.":"Guarda después para persistir.",C=e.title||"Sin título";window.confirm(`${N} nodo "${C}"? ${h}`)&&l(e)}function m(N){t({...e,...N})}function y(N){if(N==="none"){const C=yo(e);if((C.config&&typeof C.config=="object"?C.config:{}).game_id==="simple_checkpoint"||C.game_type==="simple_checkpoint"||C.game_template_id==="simple_checkpoint"){const U=Pt("logic_circuit");t({...C,...U,title:e.title||U.label,game_type:"logic_circuit",game_template_id:"logic_circuit",game_family:U.type,_clear_physical_fields:!0,_type_choice_done:!0}),i==null||i();return}t(C),i==null||i();return}if(N==="map_collectible"){const C=Pt("simple_checkpoint");t({...e,type:C.type,label:"Coleccionable de mapa",title:"Objeto Coleccionable",physical_qr:null,physical_node_kind:"collectible",physical_item_kind:"collectible",physical_item_id:e.physical_item_id||"objeto_mapa",physical_item_label:e.physical_item_label||"Objeto de mapa",game_family:"physical_qr",game_type:"qr_collectible",game_template_id:"qr_collectible",entry_mode:"gps",completion_method:"proximity",requires_proximity:!0,qr_payload:"",fallback_code:"OK",physical_fallback_code:"OK",config:{...e.config||{},is_map_collectible:!0,completion_method:"proximity",game_id:"qr_collectible",game_title:"Objeto de mapa"},messages:{hint:"Acércate para recoger este objeto.",gps_unavailable:"Activa GPS para poder recoger el objeto.",locked:"Muévete al punto para recoger el objeto."},content:"Un objeto coleccionable se encuentra en esta ubicación. Acércate para recogerlo.",description:"Objeto coleccionable de mapa.",_type_choice_done:!0}),i==null||i();return}if(N==="qr"){const C=vo(e,"collectible");t({...e,physical_qr:C,physical_node_kind:"collectible",physical_item_kind:"collectible",qr_payload:C.payload,physical_item_id:C.item_id,physical_item_label:C.label,game_family:"physical_qr",game_type:"qr_collectible",game_template_id:"qr_collectible",entry_mode:"qr",completion_method:"qr_scan",requires_proximity:!1,fallback_code:jn(e),physical_fallback_code:jn(e),config:{...e.config||{},is_map_collectible:!1,completion_method:"qr_scan",game_id:"qr_collectible",game_title:"Objeto QR"},_type_choice_done:!0}),i==null||i();return}const h=vo(e,N);m({physical_node_kind:N,physical_item_kind:N,physical_qr:h,qr_payload:h.payload,physical_item_id:h.item_id,physical_item_label:h.label}),i==null||i()}function b(N){const h=fi(e);m({physical_node_kind:N.kind,physical_qr:N,qr_payload:N.payload,physical_item_id:N.item_id,physical_item_label:N.label,physical_item_kind:N.kind,config:{...h,success_code:String(h.success_code||h.fallback_code||jn(e))}})}function w(N){const h=fi(e);m({config:{...h,success_code:N.trim().toUpperCase()}})}return!a&&s?n.jsx("section",{className:"saga-node-physical-type-panel saga-physical-guided-v4-shell",style:Za,"aria-label":"Editor guiado de QR físico",children:n.jsx(ol,{stage:e,onPatch:N=>m(N),onClose:o??(()=>{}),onDelete:p})}):a?n.jsxs("section",{className:"saga-type-chooser-v4",style:Za,"aria-label":"Tipo de nodo",children:[n.jsx("header",{className:"saga-type-chooser-v4-head",children:n.jsxs("div",{children:[n.jsx("span",{children:"TIPO DE NODO"}),n.jsx("h2",{children:"Selecciona el tipo de nodo"}),n.jsx("p",{children:"Elige la experiencia o interacción que tendrá este punto en la misión."})]})}),n.jsxs("div",{className:"saga-type-chooser-v4-grid",children:[n.jsxs("button",{type:"button",className:d==="none"&&(e.game_type==="simple_checkpoint"||((f=e.config)==null?void 0:f.game_id)==="simple_checkpoint")?"active":"",onClick:()=>{const N=Pt("simple_checkpoint"),h=yo(e);t({...h,...N,type:N.type,label:"Checkpoint",icon:N.icon,title:e.title||"Checkpoint / Texto Rápido",game_type:"simple_checkpoint",game_template_id:"simple_checkpoint",game_family:N.type,entry_mode:"gps",completion_method:"proximity",requires_proximity:!0,content:String(e.content||"").trim()||"Escribe aquí el texto o pista que se mostrará al jugador en este checkpoint.",config:{...h.config||{},...N.config||{},is_map_collectible:!1,game_id:"simple_checkpoint",game_title:"Checkpoint",objective:"checkpoint",completion_method:"proximity"},_clear_physical_fields:!0,_type_choice_done:!0}),i==null||i()},children:[n.jsx("i",{children:"📍"}),n.jsx("strong",{children:"Checkpoint / Pista"}),n.jsx("small",{children:"Punto GPS simple. Muestra texto, historia o pista sin minijuegos complejos."})]}),n.jsxs("button",{type:"button",className:d==="none"&&e.game_type!=="simple_checkpoint"&&((v=e.config)==null?void 0:v.game_id)!=="simple_checkpoint"?"active":"",onClick:()=>y("none"),children:[n.jsx("i",{children:"🎮"}),n.jsx("strong",{children:"Minijuego o Desafío"}),n.jsx("small",{children:"Prueba interactiva en mapa: Laberinto, Secuencia, Matriz, Agitar o Sonido."})]}),n.jsxs("button",{type:"button",className:d==="map_collectible"?"active":"",onClick:()=>y("map_collectible"),children:[n.jsx("i",{children:"🌟"}),n.jsx("strong",{children:"Coleccionable (GPS)"}),n.jsx("small",{children:"Objeto digital que el jugador recoge automáticamente al acercarse con el GPS."})]}),n.jsxs("button",{type:"button",className:d==="qr"?"active":"",onClick:()=>y("qr"),children:[n.jsx("i",{children:"▦"}),n.jsx("strong",{children:"Tarjeta QR Física"}),n.jsx("small",{children:"Llave, pista u objeto impreso que requiere escanear un código QR físico."})]})]})]}):n.jsxs("section",{className:"saga-node-physical-type-panel",style:Za,"aria-label":"Tipo de nodo",children:[o?n.jsxs("div",{className:"saga-physical-editor-topbar",children:[n.jsxs("div",{className:"saga-physical-editor-topbar__copy",children:[n.jsx("span",{children:s?"QR físico":"Nodo normal"}),n.jsx("strong",{children:e.title||(s?"Objeto físico":"Nodo")})]}),n.jsxs("div",{className:"saga-physical-editor-topbar__actions",children:[n.jsx("button",{type:"button",className:"saga-physical-editor-topbar__change",onClick:r,children:"Cambiar tipo"}),l?n.jsx("button",{type:"button",className:"saga-physical-editor-topbar__delete",onClick:()=>{const N=c?"Descartar nodo local":"Eliminar nodo";window.confirm(`${N} "${e.title||"Sin título"}"? Guarda después para persistir.`)&&(l(e),o==null||o())},"aria-label":c?"Descartar nodo local":"Eliminar nodo físico",children:c?"Descartar":"Eliminar"}):null,n.jsx("button",{type:"button",className:"saga-physical-editor-topbar__close",onClick:o,"aria-label":"Cerrar editor físico",children:"Cerrar ×"})]})]}):null,a?n.jsxs("div",{style:ju,children:[n.jsxs("div",{children:[n.jsx("div",{style:wu,children:"TIPO DE NODO"}),n.jsx("strong",{style:ku,children:s?"Nodo QR físico":"Nodo normal jugable"}),n.jsx("p",{style:Su,children:s?"Usa este modo para objetos físicos, llaves, pistas o bonus. No muestra el editor de minijuego normal.":"Usa este modo para ruta, GPS, minijuego y reglas normales."})]}),n.jsx("span",{style:s?Cu:sl,children:s?"QR FÍSICO":"NORMAL"})]}):null,a?n.jsxs("div",{style:Nu,children:[n.jsxs("button",{type:"button",style:d==="none"?Ru:dl,onClick:()=>y("none"),children:[n.jsx("span",{style:jo,children:"●"}),n.jsxs("span",{children:[n.jsx("strong",{style:wo,children:"Normal"}),n.jsx("small",{style:ko,children:"Ruta, GPS o minijuego"})]})]}),n.jsx("div",{style:Eu,children:ll.map(N=>n.jsxs("button",{type:"button",style:d===N.id?Mu:cl,onClick:()=>y(N.id),children:[n.jsx("span",{style:jo,children:N.icon}),n.jsx("strong",{style:wo,children:N.label}),n.jsx("small",{style:ko,children:N.help})]},N.id))})]}):n.jsxs("div",{style:Iu,children:[n.jsx("span",{children:s?"Configurar objeto físico":"Configurar nodo"}),n.jsx("button",{type:"button",style:Co,onClick:r,children:"Cambiar"})]}),!a&&s?n.jsxs("div",{style:zu,children:[n.jsxs("div",{style:So,children:[n.jsx("span",{children:"Datos del objeto"}),n.jsx("small",{children:"Datos básicos y código de emergencia"})]}),n.jsxs("label",{style:Xa,children:["Nombre visible",n.jsx("input",{value:e.title||"",onChange:N=>m({title:N.target.value,physical_item_label:N.target.value}),placeholder:"Buscar a tu enemigo",style:hi})]}),n.jsxs("label",{style:Xa,children:["Descripción breve",n.jsx("textarea",{value:yu(e,"content"),onChange:N=>m({content:N.target.value}),placeholder:"Objeto escondido, pista física o misión secundaria.",style:qu})]}),n.jsxs("div",{style:Au,children:[n.jsxs("div",{style:ei,children:[n.jsx("span",{children:"Lat"}),n.jsx("b",{children:_o(e.lat)})]}),n.jsxs("div",{style:ei,children:[n.jsx("span",{children:"Lon"}),n.jsx("b",{children:_o(e.lon)})]}),n.jsxs("div",{style:ei,children:[n.jsx("span",{children:"Mapa"}),n.jsx("b",{children:"Mover punto"})]})]}),n.jsxs("div",{style:Lu,children:[n.jsxs("div",{style:So,children:[n.jsx("span",{children:"Código fallback"}),n.jsx("small",{children:"Emergencia offline para completar este QR si falla la cámara, el escaneo o la cobertura."})]}),n.jsxs("label",{style:Xa,children:["Código preestablecido",n.jsx("input",{value:jn(e),placeholder:jn(e),onChange:N=>w(N.target.value),style:hi})]}),n.jsx("button",{type:"button",style:Co,onClick:()=>w(`SAGA-${String(e.index+1).padStart(2,"0")}`),children:"Generar fallback"})]}),d!=="map_collectible"&&n.jsx(nu,{initialLabel:e.physical_item_label||e.title||"Buscar a tu enemigo",initialKind:d,compact:!0,onSaveToNode:b})]}):a?null:n.jsx("div",{style:Pu,children:"Nodo normal. El editor de juego, ubicación, mensajes y reglas está debajo."})]})}const Za={display:"grid",gap:12,padding:14,borderRadius:24,border:"1px solid rgba(255,255,255,.12)",background:"linear-gradient(180deg, rgba(15,23,42,.60), rgba(15,23,42,.38))"},ju={display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12},wu={color:"#93c5fd",fontSize:10,fontWeight:950,letterSpacing:"0.14em",textTransform:"uppercase"},ku={display:"block",marginTop:4,color:"#ffffff",fontSize:17,lineHeight:1.08,fontWeight:950},Su={margin:"7px 0 0",color:"rgba(226,232,240,.72)",fontSize:12,lineHeight:1.35,fontWeight:760},sl={minHeight:30,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"0 12px",borderRadius:999,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.08)",color:"#e2e8f0",fontSize:11,fontWeight:950,whiteSpace:"nowrap"},Cu={...sl,border:"1px solid rgba(187,247,208,.22)",background:"rgba(34,197,94,.14)",color:"#dcfce7"},Nu={display:"grid",gap:8},Eu={display:"grid",gridTemplateColumns:"repeat(2, minmax(0, 1fr))",gap:8},dl={minHeight:74,display:"grid",gridTemplateColumns:"34px 1fr",alignItems:"center",justifyItems:"start",gap:10,padding:"10px 14px",borderRadius:18,border:"1px solid rgba(255,255,255,.10)",background:"rgba(15,23,42,.34)",color:"#e2e8f0",textAlign:"left",cursor:"pointer"},Ru={...dl,border:"1px solid rgba(187,247,208,.30)",background:"rgba(34,197,94,.17)",color:"#dcfce7"},cl={minHeight:88,display:"grid",alignContent:"center",justifyItems:"center",gap:4,padding:"9px 10px",borderRadius:18,border:"1px solid rgba(255,255,255,.10)",background:"rgba(15,23,42,.34)",color:"#e2e8f0",textAlign:"center",cursor:"pointer",overflow:"hidden"},Mu={...cl,border:"1px solid rgba(187,247,208,.26)",background:"rgba(34,197,94,.15)",color:"#dcfce7"},jo={display:"block",fontSize:19,lineHeight:1},wo={display:"block",fontSize:13,lineHeight:1.08,fontWeight:950},ko={display:"block",maxWidth:150,color:"rgba(226,232,240,.82)",fontSize:10,lineHeight:1.18,fontWeight:760},zu={display:"grid",gap:12,paddingTop:4},So={display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,color:"#e2e8f0",fontSize:12,fontWeight:950},Xa={display:"grid",gap:6,color:"rgba(241,245,249,.88)",fontSize:10,fontWeight:950,letterSpacing:"0.08em",textTransform:"uppercase"},hi={width:"100%",minHeight:42,borderRadius:15,border:"1px solid rgba(255,255,255,.13)",background:"rgba(15,23,42,.44)",color:"#ffffff",padding:"0 12px",fontSize:13,fontWeight:850,outline:"none"},qu={...hi,minHeight:74,padding:12,resize:"vertical",lineHeight:1.35},Au={display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},ei={display:"grid",gap:3,padding:10,borderRadius:16,border:"1px solid rgba(255,255,255,.10)",background:"rgba(15,23,42,.28)"},Pu={padding:12,borderRadius:17,border:"1px dashed rgba(226,232,240,.16)",color:"rgba(226,232,240,.72)",fontSize:12,lineHeight:1.35},Iu={display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:10,borderRadius:18,border:"1px solid rgba(125,211,252,.18)",background:"rgba(14,165,233,.10)",color:"#dbeafe",fontSize:12,fontWeight:850},Co={minHeight:34,padding:"0 12px",borderRadius:999,border:"1px solid rgba(255,255,255,.14)",background:"rgba(15,23,42,.56)",color:"#f8fafc",fontSize:11,fontWeight:950},Lu={display:"grid",gap:10,padding:12,borderRadius:18,border:"1px solid rgba(251,191,36,.20)",background:"rgba(251,191,36,.08)"},Ft=160;function $u(e){return e?e.startsWith("data:image/")?`${Math.round(e.length/1024)} KB · data:image`:e.length>72?`${e.slice(0,54)}…${e.slice(-12)}`:e:""}function Tu(e){return new Promise((t,a)=>{if(!e.type.startsWith("image/")){a(new Error("El archivo debe ser una imagen."));return}const i=new FileReader;i.onerror=()=>a(new Error("No se pudo leer la imagen.")),i.onload=()=>{const r=new Image;r.onerror=()=>a(new Error("No se pudo procesar la imagen.")),r.onload=()=>{const o=document.createElement("canvas");o.width=Ft,o.height=Ft;const l=o.getContext("2d");if(!l){a(new Error("Canvas no disponible."));return}l.fillStyle="#0f172a",l.fillRect(0,0,Ft,Ft);const d=Math.max(Ft/r.width,Ft/r.height),s=r.width*d,c=r.height*d,u=(Ft-s)/2,p=(Ft-c)/2;l.drawImage(r,u,p,s,c),t(o.toDataURL("image/jpeg",.82))},r.src=String(i.result||"")},i.readAsDataURL(e)})}const Fu=new Set(["level_next","level_prev","restore_node","reset_profile","mark_finished"]);function Du({playerDrafts:e,profiles:t=[],stages:a=[],playerSaveState:i,playerSaveError:r,profileProgress:o,profileActionState:l,profileActionError:d,onUpdatePlayer:s,onDeletePlayer:c,onAddPlayer:u,onSavePlayers:p,onProfileAction:m}){const[y,b]=S.useState(null);async function w(f,v){var h;const N=(h=f.currentTarget.files)==null?void 0:h[0];if(N)try{const C=await Tu(N);s(v,"avatar_url",C),s(v,"avatar_initials","")}catch(C){window.alert(C instanceof Error?C.message:"No se pudo cargar el avatar.")}finally{f.currentTarget.value=""}}return n.jsxs("div",{className:"admin-cms-local-panel admin-players-panel admin-panel-modern",children:[n.jsxs("div",{className:"admin-panel-hero",children:[n.jsxs("div",{children:[n.jsx("span",{className:"admin-kicker",children:"Players"}),n.jsx("h2",{children:"Players & teams"}),n.jsx("p",{children:"Manage who can play this mission. Save players to persist changes."})]}),n.jsxs("div",{className:"admin-panel-count",children:[n.jsx("strong",{children:e.length}),n.jsx("span",{children:"profiles"})]})]}),e.length===0?n.jsxs("div",{className:"admin-empty-panel admin-empty-panel-modern",children:[n.jsx("strong",{children:"No players yet"}),n.jsx("span",{children:"Add one player or team to start testing the mission."})]}):n.jsx("div",{className:"admin-player-editor-list admin-player-editor-list-modern",children:e.map((f,v)=>{const N=y===v;return n.jsxs("section",{className:`admin-player-editor-card admin-player-card-modern${N?"":" is-collapsed"}`,children:[n.jsxs("div",{className:"admin-player-editor-head admin-player-head-modern",role:"button",tabIndex:0,"aria-expanded":N,onClick:()=>b(N?null:v),onKeyDown:h=>{(h.key==="Enter"||h.key===" ")&&(h.preventDefault(),b(N?null:v))},children:[n.jsx("div",{className:"admin-player-avatar",style:{background:f.color||nn(f.id||f.display_name),color:"#ffffff",boxShadow:"0 10px 26px rgba(15,23,42,0.28)",overflow:"hidden"},children:f.avatar_url?n.jsx("img",{src:f.avatar_url,alt:"",className:"admin-player-avatar-image"}):f.avatar_initials||tn(f.display_name||f.id)}),n.jsxs("div",{children:[n.jsx("strong",{children:f.display_name||f.id||`Player ${v+1}`}),n.jsx("span",{children:f.mode==="team"?"Equipo":"Jugador individual"})]}),n.jsxs("div",{className:"admin-player-head-actions",children:[n.jsx("button",{type:"button",className:"admin-player-edit-toggle",onClick:h=>{h.stopPropagation(),b(N?null:v)},children:N?"▾ Cerrar":"✏️ Editar · 📷 Foto · 🎒 Mochila"}),n.jsx("button",{type:"button",className:"admin-inline-danger",onClick:h=>{h.stopPropagation(),c(v)},children:"Eliminar"})]})]}),(()=>{const h=l[f.id]||"",C=Fu.has(h)?h:"",z=h==="saved";return n.jsxs("div",{className:"admin-player-progress-controls",children:[n.jsxs("div",{className:"admin-player-progress-copy",children:[n.jsx("strong",{children:"Progreso de partida"}),n.jsx("span",{children:(()=>{var pe,ke;const B=((pe=o[f.id])==null?void 0:pe.level)??0;if((ke=o[f.id])==null?void 0:ke.finished)return`Finalizado · ${a.length} de ${a.length} nodos`;const ee=a[B],_e=ee!=null&&ee.title?String(ee.title):null;return _e?`Nodo ${B+1} de ${a.length} · ${_e}`:`Nivel ${B}`})()}),d[f.id]?n.jsx("small",{children:d[f.id]}):z?n.jsx("small",{className:"admin-player-progress-ok",children:"✓ Aplicado"}):null]}),n.jsxs("div",{className:"admin-player-progress-buttons",children:[n.jsx("button",{type:"button",className:"admin-inline-soft",disabled:!!C,"data-busy":C==="restore_node"?"true":void 0,onClick:()=>{window.confirm(`¿Estás seguro de Restaurar Nodo para ${f.display_name}? Esto restará el tiempo empleado y bajará 1 nivel.`)&&m(f.id,"restore_node")},title:"Baja 1 nivel y restaura el tiempo (limpia penalización)",children:C==="restore_node"?"⏳ Restaurando…":"Restaurar Nodo"}),n.jsx("button",{type:"button",className:"admin-inline-soft",disabled:!!C,"data-busy":C==="level_prev"?"true":void 0,onClick:()=>m(f.id,"level_prev"),title:"Baja 1 nivel (sin borrar el tiempo acumulado)",children:"← 1 nodo"}),n.jsx("button",{type:"button",className:"admin-inline-soft",disabled:!!C,"data-busy":C==="level_next"?"true":void 0,onClick:()=>m(f.id,"level_next"),children:"+1 nodo"}),n.jsx("button",{type:"button",className:"admin-inline-soft",disabled:!!C,"data-busy":C==="reset_profile"?"true":void 0,onClick:()=>m(f.id,"reset_profile"),children:"Reset"}),n.jsx("button",{type:"button",className:"admin-inline-soft",disabled:!!C,"data-busy":C==="mark_finished"?"true":void 0,onClick:()=>m(f.id,"mark_finished"),children:"Finalizar"})]})]})})(),n.jsxs("div",{className:"admin-player-form-grid",children:[n.jsxs("label",{children:["Player ID",n.jsx("input",{value:f.id,onChange:h=>s(v,"id",h.target.value)})]}),n.jsxs("label",{children:["Display name",n.jsx("input",{value:f.display_name,onChange:h=>s(v,"display_name",h.target.value)})]}),n.jsxs("label",{children:["Mode",n.jsxs("select",{value:f.mode,onChange:h=>s(v,"mode",h.target.value),children:[n.jsx("option",{value:"solo",children:"solo"}),n.jsx("option",{value:"team",children:"team"})]})]})]}),n.jsxs("div",{className:"admin-player-avatar-tools",children:[n.jsxs("div",{className:"admin-player-avatar-preview-row",children:[n.jsx("div",{className:"admin-player-avatar",style:{width:74,height:74,fontSize:20,background:f.color||nn(f.id||f.display_name),color:"#ffffff",boxShadow:"0 14px 30px rgba(15,23,42,0.32)",overflow:"hidden",flex:"0 0 auto"},children:f.avatar_url?n.jsx("img",{src:f.avatar_url,alt:"",className:"admin-player-avatar-image"}):f.avatar_initials||tn(f.display_name||f.id)}),n.jsxs("div",{children:[n.jsx("strong",{children:f.avatar_url?"Foto guardada":"Sin foto"}),n.jsx("span",{children:f.avatar_url?$u(f.avatar_url):"Se mostrarán iniciales hasta subir una imagen."})]})]}),n.jsxs("div",{className:"admin-player-avatar-preview-row",children:[n.jsxs("label",{children:["Color",n.jsx("input",{type:"color",value:/^#[0-9a-fA-F]{6}$/.test(f.color)?f.color:nn(f.id||f.display_name),onChange:h=>s(v,"color",h.target.value)})]}),n.jsxs("label",{children:["Iniciales",n.jsx("input",{value:f.avatar_initials,maxLength:3,placeholder:tn(f.display_name||f.id),onChange:h=>s(v,"avatar_initials",h.target.value.toUpperCase().slice(0,3))})]})]}),n.jsxs("label",{className:"admin-player-avatar-upload",children:[f.avatar_url?"Cambiar foto":"Subir foto",n.jsx("input",{type:"file",accept:"image/png,image/jpeg,image/webp",onChange:h=>void w(h,v)}),n.jsx("span",{children:"La imagen se comprime y se guarda en runtime al pulsar Guardar jugadores."})]}),f.avatar_url?n.jsx("button",{type:"button",className:"admin-inline-soft",onClick:()=>s(v,"avatar_url",""),children:"Quitar foto"}):null]}),f.mode==="team"?n.jsxs("label",{className:"admin-player-members",children:["Team members",n.jsx("input",{value:f.members,placeholder:"Name 1, Name 2",onChange:h=>s(v,"members",h.target.value)})]}):null,(()=>{var z;const h=t.find(B=>String(B.id)===String(f.id||f.display_name)),C=((z=h==null?void 0:h.inventory_snapshot)==null?void 0:z.items)||[];return n.jsxs("section",{className:"admin-player-inventory",style:{marginTop:"1rem",padding:"1rem",background:"rgba(0,0,0,0.2)",borderRadius:"8px"},children:[n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"},children:[n.jsxs("strong",{style:{fontSize:"0.85rem",color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.05em"},children:["🎒 Mochila / Coleccionables (",C.length,")"]}),C.length>0?n.jsx("button",{type:"button",style:{padding:"0.2rem 0.6rem",fontSize:"0.75rem",background:"rgba(239, 68, 68, 0.2)",color:"#fca5a5",border:"1px solid rgba(239, 68, 68, 0.35)",borderRadius:"6px",cursor:"pointer",fontWeight:700},onClick:()=>{window.confirm(`¿Vaciar TODOS los objetos de la mochila de ${f.display_name}?`)&&m(f.id,"clear_inventory")},children:"🧹 Vaciar mochila"}):null]}),C.length===0?n.jsx("div",{style:{color:"#64748b",fontSize:"0.9rem",fontStyle:"italic"},children:"La mochila está vacía."}):n.jsx("ul",{style:{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:"0.5rem"},children:C.map((B,U)=>n.jsxs("li",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.05)",padding:"0.5rem",borderRadius:"4px"},children:[n.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"0.5rem"},children:[n.jsxs("span",{style:{fontSize:"1.1rem"},children:[B.quantity,"x"]}),n.jsx("strong",{style:{color:"#e2e8f0"},children:B.label||B.item_id})]}),n.jsx("div",{style:{display:"flex",gap:"0.25rem"},children:n.jsx("button",{type:"button",style:{padding:"0.2rem 0.5rem",fontSize:"0.8rem",background:"rgba(239, 68, 68, 0.2)",color:"#fca5a5",border:"1px solid rgba(239, 68, 68, 0.3)",borderRadius:"4px",cursor:"pointer"},onClick:()=>{window.confirm(`¿Quitar ${B.label||B.item_id} a ${f.display_name}?`)&&m(f.id,`remove_item:${B.item_id}`)},children:"Quitar"})})]},U))}),n.jsx("div",{style:{marginTop:"0.75rem",display:"flex",gap:"0.5rem",alignItems:"center"},children:n.jsxs("select",{style:{padding:"0.3rem",fontSize:"0.85rem",background:"rgba(0,0,0,0.3)",color:"#e2e8f0",border:"1px solid rgba(255,255,255,0.2)",borderRadius:"4px"},onChange:B=>{const U=B.target.value;if(U){if(U==="__manual__"){const ee=window.prompt("ID o Nombre del objeto a entregar (ej. llave_dorada):");ee&&m(f.id,`give_item:${ee}`)}else window.confirm(`¿Dar ${U} a ${f.display_name}?`)&&m(f.id,`give_item:${U}`);B.target.value=""}},children:[n.jsx("option",{value:"",children:"+ Añadir Objeto..."}),Array.from(new Set(a.filter(B=>B.physical_item_id).map(B=>B.physical_item_id))).map(B=>{var U;return n.jsx("option",{value:B,children:`Dar "${((U=a.find(ee=>ee.physical_item_id===B))==null?void 0:U.physical_item_label)||B}" (${B})`},B)}),n.jsx("option",{value:"__manual__",children:"Escribir ID manualmente..."})]})})]})})()]},`player-draft-card-${v}`)})}),i==="error"&&r?n.jsxs("div",{className:"admin-save-error",children:[n.jsx("strong",{children:"Player save failed"}),n.jsx("span",{children:r})]}):null,n.jsxs("div",{className:"admin-local-actions admin-panel-sticky-actions",children:[n.jsx("button",{type:"button",onClick:u,children:"Add player"}),n.jsx("button",{type:"button",className:"admin-cms-side-action--save",onClick:p,disabled:i==="saving",children:i==="saving"?"Saving players…":i==="saved"?"Players saved":"Save players"})]})]})}function ul(){const[e,t]=S.useState(_s());return S.useEffect(()=>{function a(i){const r=i.detail;r&&r.locale&&t(r.locale)}return window.addEventListener("saga:locale-change",a),()=>window.removeEventListener("saga:locale-change",a)},[]),{locale:e,t:a=>vs(a,e)}}function Ou({missionDraft:e,settingsSaveState:t,settingsSaveError:a,onUpdateMissionDraft:i,onSaveSettings:r}){const{t:o}=ul();return n.jsxs("div",{className:"admin-cms-local-panel admin-settings-panel admin-panel-modern",children:[n.jsxs("div",{className:"admin-panel-hero",children:[n.jsxs("div",{children:[n.jsx("span",{className:"admin-kicker",children:o("admin.settingsPanel.title")}),n.jsx("h2",{children:o("admin.settingsPanel.title")}),n.jsx("p",{children:o("admin.settingsPanel.subtitle")})]}),n.jsxs("div",{className:"admin-panel-count",style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"4px"},children:[n.jsx("span",{children:o("admin.settingsPanel.themeLabel")}),n.jsxs("select",{value:e.player_theme||"glass",onChange:l=>i("player_theme",l.target.value),style:{padding:"4px 8px",borderRadius:"4px",background:"rgba(0,0,0,0.5)",color:"white",border:"1px solid rgba(255,255,255,0.2)"},children:[n.jsx("option",{value:"glass",children:"Cristal (Glass)"}),n.jsx("option",{value:"flame-red",children:"Rojo (Fuego)"})]})]})]}),n.jsxs("section",{className:"admin-settings-section-modern",children:[n.jsxs("div",{className:"admin-settings-section-head",children:[n.jsx("strong",{children:o("admin.settingsPanel.identity")}),n.jsx("span",{children:o("admin.settingsPanel.identitySubtitle")})]}),n.jsxs("div",{className:"admin-settings-grid-modern",children:[n.jsxs("label",{children:[o("admin.settingsPanel.siteName"),n.jsx("input",{value:e.site_name||"",placeholder:"SAGA Engine",onChange:l=>i("site_name",l.target.value)})]}),n.jsxs("label",{children:[o("admin.settingsPanel.adminTitle"),n.jsx("input",{value:e.admin_title||"",placeholder:"Mission Control",onChange:l=>i("admin_title",l.target.value)})]}),n.jsxs("label",{children:[o("admin.settingsPanel.adminSubtitle"),n.jsx("input",{value:e.admin_subtitle||"",placeholder:"Map-first control panel",onChange:l=>i("admin_subtitle",l.target.value)})]}),n.jsxs("label",{children:[o("admin.settingsPanel.loginSubtitle"),n.jsx("input",{value:e.login_subtitle||"",placeholder:"Protected access",onChange:l=>i("login_subtitle",l.target.value)})]})]})]}),n.jsxs("section",{className:"admin-settings-section-modern",children:[n.jsxs("div",{className:"admin-settings-section-head",children:[n.jsx("strong",{children:o("admin.settingsPanel.mapDefaults")}),n.jsx("span",{children:o("admin.settingsPanel.mapDefaultsSubtitle")})]}),n.jsxs("div",{className:"admin-settings-map-grid",children:[n.jsxs("label",{children:[o("admin.settingsPanel.latitude"),n.jsx("input",{value:e.map_center_lat||"",onChange:l=>i("map_center_lat",l.target.value)})]}),n.jsxs("label",{children:[o("admin.settingsPanel.longitude"),n.jsx("input",{value:e.map_center_lon||"",onChange:l=>i("map_center_lon",l.target.value)})]}),n.jsxs("label",{children:[o("admin.settingsPanel.zoom"),n.jsx("input",{value:e.map_zoom||"",onChange:l=>i("map_zoom",l.target.value)})]})]})]}),n.jsxs("section",{className:"admin-settings-section-modern",children:[n.jsxs("div",{className:"admin-settings-section-head",children:[n.jsx("strong",{children:o("admin.settingsPanel.mapboxTitle")}),n.jsx("span",{children:o("admin.settingsPanel.mapboxSubtitle")})]}),n.jsxs("div",{className:"admin-settings-grid-modern",style:{gridTemplateColumns:"1fr"},children:[n.jsxs("div",{style:{padding:"12px 16px",background:"rgba(234, 179, 8, 0.1)",border:"1px solid rgba(234, 179, 8, 0.3)",borderRadius:"8px",color:"#facc15",fontSize:"13px",lineHeight:"1.5",marginBottom:"8px"},children:[n.jsx("strong",{children:o("admin.settingsPanel.mapboxWarningTitle")}),n.jsx("br",{}),o("admin.settingsPanel.mapboxWarningText")]}),n.jsxs("label",{className:"admin-wide-field",children:[o("admin.settingsPanel.mapboxToken"),n.jsx("input",{value:e.mapbox_token||"",placeholder:"pk.ey...",onChange:l=>i("mapbox_token",l.target.value)})]}),n.jsxs("label",{className:"admin-wide-field",children:[o("admin.settingsPanel.mapboxStyle"),n.jsx("input",{value:e.mapbox_style||"",placeholder:"mapbox://styles/mapbox/satellite-streets-v12",onChange:l=>i("mapbox_style",l.target.value)})]})]})]}),n.jsxs("section",{className:"admin-settings-section-modern",children:[n.jsxs("div",{className:"admin-settings-section-head",children:[n.jsx("strong",{style:{color:"#38bdf8"},children:"📜 Editor de Prólogo e Historia Inicial"}),n.jsx("span",{children:"Configura el título, subtítulo e historia del prólogo que ven los jugadores al iniciar la misión"})]}),n.jsxs("div",{className:"admin-settings-grid-modern",children:[n.jsxs("label",{children:["Título del Prólogo",n.jsx("input",{value:e.prologue_title||"",placeholder:"Ej: Título de la misión",onChange:l=>i("prologue_title",l.target.value)})]}),n.jsxs("label",{children:["Subtítulo del Prólogo",n.jsx("input",{value:e.prologue_subtitle||"",placeholder:"Ej: Misión en el monte",onChange:l=>i("prologue_subtitle",l.target.value)})]}),n.jsxs("label",{className:"admin-wide-field",children:["URL Imagen de Portada del Prólogo (Opcional)",n.jsx("input",{value:e.prologue_image_url||"",placeholder:"https://ejemplo.com/imagen-prologo.jpg",onChange:l=>i("prologue_image_url",l.target.value)})]}),n.jsxs("label",{className:"admin-wide-field",children:["Cuerpo / Texto Completo de la Historia del Prólogo",n.jsx("textarea",{rows:6,value:e.prologue_body||"",onChange:l=>i("prologue_body",l.target.value),placeholder:"Escribe aquí la historia inicial. Puedes usar Markdown para dar formato: **texto en negrita**, *cursiva*, o imágenes ![Descripción](https://url-de-la-imagen.jpg)...",style:{minHeight:"120px",fontFamily:"inherit",fontSize:"13px",lineHeight:"1.5"}})]})]})]}),n.jsxs("section",{className:"admin-settings-section-modern",children:[n.jsxs("div",{className:"admin-settings-section-head",children:[n.jsx("strong",{style:{color:"#22c55e"},children:"🔐 Pantalla de Inicio de Sesión (Login de Jugador)"}),n.jsx("span",{children:"Personaliza el texto de bienvenida, subtítulo e instrucciones que ven los jugadores al entrar"})]}),n.jsxs("div",{className:"admin-settings-grid-modern",children:[n.jsxs("label",{children:["Título de Bienvenida (Login)",n.jsx("input",{value:e.login_title||"",placeholder:"Ej: Benvidos a SAGA Engine",onChange:l=>i("login_title",l.target.value)})]}),n.jsxs("label",{children:["Subtítulo de Login",n.jsx("input",{value:e.login_subtitle||"",placeholder:"Ej: Selecciona o teu equipo ou introduce a túa clave",onChange:l=>i("login_subtitle",l.target.value)})]}),n.jsxs("label",{className:"admin-wide-field",children:["Instrucciones o Mensaje de Login",n.jsx("textarea",{rows:3,value:e.login_instructions||"",onChange:l=>i("login_instructions",l.target.value),placeholder:"Mensaje o aviso para los jugadores al iniciar sesión...",style:{minHeight:"80px",fontFamily:"inherit",fontSize:"13px"}})]})]})]}),t==="error"&&a?n.jsxs("div",{className:"admin-save-error",children:[n.jsx("strong",{children:o("admin.settingsPanel.saveFailed")}),n.jsx("span",{children:a})]}):null,n.jsx("div",{className:"admin-local-actions admin-panel-sticky-actions",children:n.jsx("button",{type:"button",className:"admin-cms-side-action admin-cms-side-action--save",onClick:r,disabled:t==="saving",children:o(t==="saving"?"admin.settingsPanel.saving":t==="saved"?"admin.settingsPanel.saved":"admin.settingsPanel.save")})})]})}function Bu({stages:e,onCreateNode:t,onApplyTemplate:a}){return n.jsxs("div",{className:"admin-cms-local-panel saga-mission-builder-panel",children:[n.jsx("strong",{children:"Crear contenido"}),n.jsx("span",{children:"Crea un nodo suelto para editarlo a mano, o arranca una plantilla completa de misión. Nada se guarda hasta pulsar Guardar."}),n.jsxs("button",{type:"button",className:"saga-builder-single-node",onClick:t,children:[n.jsx("span",{children:"＋"}),n.jsxs("div",{children:[n.jsx("strong",{children:"Crear nodo suelto"}),n.jsx("small",{children:"Empieza con un nodo normal y elige después si será QR, pista, bonus o minijuego."})]})]}),e.length>0?n.jsx("div",{className:"saga-builder-warning",children:"Las plantillas reemplazan la ruta local visible. No se persiste nada hasta pulsar Guardar."}):null,n.jsx("div",{className:"saga-template-grid",children:ui.map(i=>n.jsxs("article",{className:"saga-template-card",children:[n.jsxs("div",{className:"saga-template-card-head",children:[n.jsx("span",{children:i.icon}),n.jsxs("div",{children:[n.jsx("strong",{children:i.title}),n.jsx("small",{children:i.goodFor})]})]}),n.jsx("p",{children:i.summary}),n.jsx("ol",{children:i.stages.map(r=>n.jsx("li",{children:r.title},`${i.id}-${r.title}`))}),n.jsx("button",{type:"button",onClick:()=>a(i.id),children:"Usar plantilla"})]},i.id))})]})}const Gu=[{id:"llave_rota",label:"Llave Rota",icon:"🔑",description:"Parte de una llave maestra. Necesita cinta para ser reparada.",recipeUsedIn:"Reparar Llave"},{id:"cinta_aislante",label:"Cinta Aislante",icon:"🩹",description:"Cinta adhesiva fuerte. Se usa para reparaciones rápidas.",recipeUsedIn:"Reparar Llave"},{id:"bateria_litio",label:"Batería de Litio",icon:"🔋",description:"Fuente de energía de alta capacidad para dispositivos EMP.",recipeUsedIn:"EMP / Decodificador"},{id:"cables_cobre",label:"Cables de Cobre",icon:"🔌",description:"Cables conductores para electrónica avanzada.",recipeUsedIn:"Dispositivo EMP"},{id:"placa_base",label:"Placa Base",icon:"💾",description:"Tarjeta electrónica base para integrar componentes.",recipeUsedIn:"EMP / Escáner Biométrico"},{id:"chip_encriptado",label:"Chip Encriptado",icon:"💻",description:"Circuito con datos cifrados de alta seguridad.",recipeUsedIn:"Decodificador Cuántico"},{id:"antena_frecuencia",label:"Antena de Frecuencia",icon:"📡",description:"Antena para captar ondas de comunicación lejanas.",recipeUsedIn:"Decodificador Cuántico"},{id:"sensor_optico",label:"Sensor Óptico",icon:"👁️",description:"Lente electrónica para escaneo biométrico.",recipeUsedIn:"Escáner Biométrico"},{id:"cristal_enfoque",label:"Cristal de Enfoque",icon:"🔍",description:"Prisma de precisión para escaneo biométrico.",recipeUsedIn:"Escáner Biométrico"},{id:"gemas_antiguas",label:"Gemas Antiguas",icon:"💎",description:"Piedras preciosas grabadas con símbolos ancestrales.",recipeUsedIn:"Amuleto del Guardián"},{id:"fragmento_escudo",label:"Fragmento de Escudo",icon:"🛡️",description:"Trozo de metal reforzado de un antiguo guerrero.",recipeUsedIn:"Amuleto del Guardián"},{id:"hilo_plata",label:"Hilo de Plata",icon:"🧵",description:"Fibra metálica brillante para forja y tejido místico.",recipeUsedIn:"Amuleto / Escudo Rúnico"},{id:"hierbas_curativas",label:"Hierbas Curativas",icon:"🌿",description:"Plantas medicinales recolectadas en el bosque.",recipeUsedIn:"Elixir de Alquimia"},{id:"frasco_cristal",label:"Frasco de Cristal",icon:"🧪",description:"Recipiente transparente para pócimas y elixires.",recipeUsedIn:"Elixir de Alquimia"},{id:"agua_purificada",label:"Agua Purificada",icon:"💧",description:"Agua pura de manantial para mezclas de alquimia.",recipeUsedIn:"Elixir de Alquimia"},{id:"placa_hierro",label:"Placa de Hierro",icon:"⚙️",description:"Lámina de hierro resistente para forjar escudos.",recipeUsedIn:"Escudo Rúnico"},{id:"runa_proteccion",label:"Runa de Protección",icon:"📜",description:"Símbolo grabado en piedra que repele energías.",recipeUsedIn:"Escudo Rúnico"},{id:"esfera_cristal",label:"Esfera de Cristal",icon:"🔮",description:"Orbe de vidrio místico capaz de canalizar energías.",recipeUsedIn:"Orbe de Fuego Arcano"},{id:"esencia_ignea",label:"Esencia Ígnea",icon:"🔥",description:"Extracto de fuego concentrado de las profundidades.",recipeUsedIn:"Orbe de Fuego Arcano"},{id:"polvo_estelar",label:"Polvo Estelar",icon:"✨",description:"Residuo cósmico brillante que imbuye poder místico.",recipeUsedIn:"Orbe de Fuego / Amuleto Visión"},{id:"fragmento_reliquia",label:"Fragmento de Reliquia",icon:"🏛️",description:"Pieza de un artefacto sagrado olvidado.",recipeUsedIn:"Reliquia Sagrada"},{id:"esencia_sagrada",label:"Esencia Sagrada",icon:"✨",description:"Gota de bendición divina.",recipeUsedIn:"Reliquia Sagrada"},{id:"pergamino_antiguo",label:"Pergamino Antiguo",icon:"📜",description:"Papel antiguo con encantamientos inscritos.",recipeUsedIn:"Reliquia Sagrada"},{id:"ojo_mistico",label:"Ojo Místico",icon:"👁️",description:"Talismán en forma de ojo que ve lo oculto.",recipeUsedIn:"Amuleto de Visión"},{id:"llave_maestra",label:"Llave Maestra",icon:"🔑",description:"Llave reparada capaz de abrir compartimentos cerrados."},{id:"emp_device",label:"Carga EMP",icon:"⚡",description:"Dispositivo electromagnético capaz de hackear nodos."},{id:"decodificador_cuantico",label:"Decodificador Cuántico",icon:"💻",description:"Dispositivo cibernético para descifrar señales."},{id:"escaner_biometrico",label:"Escáner Biométrico",icon:"🔬",description:"Lector biométrico para autorizar acceso."},{id:"amuleto_guardian",label:"Amuleto del Guardián",icon:"🛡️",description:"Protector que otorga paso seguro a zonas prohibidas."},{id:"elixir_alquimia",label:"Elixir de Alquimia",icon:"🧪",description:"Pócima revitalizante que permite superar pruebas físicas."},{id:"escudo_runico",label:"Escudo Rúnico",icon:"🛡️",description:"Barrera mágica forjada con runas antiguas."},{id:"orbe_fuego",label:"Orbe de Fuego Arcano",icon:"🔮",description:"Esfera mística que disipa nieblas y desbloquea el mapa."},{id:"reliquia_sagrada",label:"Reliquia Sagrada",icon:"🏛️",description:"Artefacto divino que completa grandes hazañas."},{id:"amuleto_vision",label:"Amuleto de Visión Suprema",icon:"👁️",description:"Talismán que revela pistas ocultas."}],Hu=[{id:"fix_broken_key",label:"Reparar Llave Maestra",inputs:[{id:"llave_rota",label:"Llave Rota",quantity:1},{id:"cinta_aislante",label:"Cinta Aislante",quantity:1}],outputs:[{id:"llave_maestra",label:"Llave Maestra",quantity:1}]},{id:"craft_emp_device",label:"Construir Dispositivo EMP",inputs:[{id:"bateria_litio",label:"Batería de Litio",quantity:2},{id:"cables_cobre",label:"Cables de Cobre",quantity:3},{id:"placa_base",label:"Placa Base",quantity:1}],outputs:[{id:"emp_device",label:"Carga EMP",quantity:1}]},{id:"quantum_decoder",label:"Decodificador Cuántico",inputs:[{id:"chip_encriptado",label:"Chip Encriptado",quantity:1},{id:"antena_frecuencia",label:"Antena Frecuencia",quantity:1},{id:"bateria_litio",label:"Batería Litio",quantity:1}],outputs:[{id:"decodificador_cuantico",label:"Decodificador Cuántico",quantity:1}]},{id:"biometric_scanner",label:"Escáner Biométrico",inputs:[{id:"sensor_optico",label:"Sensor Óptico",quantity:1},{id:"placa_base",label:"Placa Base",quantity:1},{id:"cristal_enfoque",label:"Cristal Enfoque",quantity:1}],outputs:[{id:"escaner_biometrico",label:"Escáner Biométrico",quantity:1}]},{id:"guardian_amulet",label:"Amuleto del Guardián",inputs:[{id:"gemas_antiguas",label:"Gemas Antiguas",quantity:2},{id:"fragmento_escudo",label:"Fragmento Escudo",quantity:1},{id:"hilo_plata",label:"Hilo de Plata",quantity:1}],outputs:[{id:"amuleto_guardian",label:"Amuleto del Guardián",quantity:1}]},{id:"alchemy_elixir",label:"Elixir de Alquimia",inputs:[{id:"hierbas_curativas",label:"Hierbas Curativas",quantity:2},{id:"frasco_cristal",label:"Frasco Cristal",quantity:1},{id:"agua_purificada",label:"Agua Purificada",quantity:1}],outputs:[{id:"elixir_alquimia",label:"Elixir de Alquimia",quantity:1}]},{id:"runic_shield",label:"Escudo Rúnico",inputs:[{id:"placa_hierro",label:"Placa de Hierro",quantity:2},{id:"runa_proteccion",label:"Runa Protección",quantity:1},{id:"hilo_plata",label:"Hilo de Plata",quantity:1}],outputs:[{id:"escudo_runico",label:"Escudo Rúnico",quantity:1}]},{id:"fire_orb",label:"Orbe de Fuego Arcano",inputs:[{id:"esfera_cristal",label:"Esfera Cristal",quantity:1},{id:"esencia_ignea",label:"Esencia Ígnea",quantity:2},{id:"polvo_estelar",label:"Polvo Estelar",quantity:1}],outputs:[{id:"orbe_fuego",label:"Orbe de Fuego Arcano",quantity:1}]},{id:"sacred_relic",label:"Reliquia Sagrada",inputs:[{id:"fragmento_reliquia",label:"Fragmento Reliquia",quantity:2},{id:"esencia_sagrada",label:"Esencia Sagrada",quantity:1},{id:"pergamino_antiguo",label:"Pergamino Antiguo",quantity:1}],outputs:[{id:"reliquia_sagrada",label:"Reliquia Sagrada",quantity:1}]},{id:"vision_amulet",label:"Amuleto de Visión Suprema",inputs:[{id:"ojo_mistico",label:"Ojo Místico",quantity:1},{id:"gemas_antiguas",label:"Gemas Antiguas",quantity:1},{id:"polvo_estelar",label:"Polvo Estelar",quantity:1}],outputs:[{id:"amuleto_vision",label:"Amuleto Visión",quantity:1}]}];function Wu({stages:e=[],onCreateNodesWithItems:t,onSelectStage:a}){function i(o){return e.find(l=>l.physical_item_id===o||(typeof l.config=="object"&&l.config?l.config:{}).reward_item_id===o)}function r(o){return e.filter(l=>(l.required_item_id||"")===o)}return n.jsxs("div",{style:Qu,children:[n.jsxs("section",{style:No,children:[n.jsx("h3",{style:Eo,children:"⚒️ Mesa de Trabajo y Recetas"}),n.jsxs("p",{style:Ro,children:["Combina ingredientes en la mesa de trabajo. Pulsa ",n.jsx("strong",{children:"⚡ Generar nodos"})," para colocar automáticamente las chinchetas de los ingredientes faltantes en el mapa."]}),n.jsx("div",{style:Mo,children:Hu.map(o=>{const l=o.inputs.filter(d=>!i(d.id));return n.jsxs("div",{style:Zu,children:[n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},children:[n.jsx("h4",{style:Xu,children:o.label}),l.length>0&&t?n.jsxs("button",{type:"button",style:ip,onClick:()=>{t(l.map(d=>({id:d.id,label:d.label})))},children:["⚡ Generar ",l.length," chincheta(s) en mapa"]}):l.length===0?n.jsx("span",{style:Po,children:"🟢 Todos los ingredientes en mapa"}):null]}),n.jsxs("div",{style:ep,children:[n.jsxs("div",{style:zo,children:[n.jsx("span",{style:qo,children:"INGREDIENTES"}),o.inputs.map((d,s)=>{const c=!!i(d.id);return n.jsxs("div",{style:Ao,children:[n.jsxs("span",{style:{color:c?"#86efac":"#fca5a5"},children:[c?"✓":"⚠️"," ",d.label]}),n.jsxs("b",{children:["×",d.quantity]})]},s)})]}),n.jsx("div",{style:np,children:"➔"}),n.jsxs("div",{style:zo,children:[n.jsx("span",{style:qo,children:"RESULTADO"}),o.outputs.map((d,s)=>n.jsxs("div",{style:Ao,children:[n.jsx("span",{style:tp,children:d.label}),n.jsxs("b",{children:["×",d.quantity]})]},s))]})]})]},o.id)})})]}),n.jsxs("section",{style:No,children:[n.jsx("h3",{style:Eo,children:"🎒 Objetos y Coleccionables"}),n.jsxs("p",{style:Ro,children:["Lista de piezas y objetos. Haz clic en ",n.jsx("strong",{children:'"📍 Crear chincheta"'})," para colocar una chincheta en el mapa y arrastrarla directamente."]}),n.jsx("div",{style:Mo,children:Gu.map(o=>{const l=i(o.id),d=r(o.id);return n.jsxs("div",{style:Vu,children:[n.jsxs("div",{style:Uu,children:[n.jsx(js,{itemId:o.id,size:28,className:"admin-obj-icon"}),n.jsxs("div",{style:{marginLeft:"10px",flex:1},children:[n.jsx("strong",{style:Ku,children:o.label}),n.jsxs("code",{style:Ju,children:["ID: ",o.id]})]}),t?n.jsx("button",{type:"button",style:ap,onClick:()=>t([{id:o.id,label:o.label}]),title:`Colocar chincheta en el mapa para ${o.label}`,children:"📍 Crear chincheta"}):null]}),n.jsx("p",{style:Yu,children:o.description}),n.jsxs("div",{style:op,children:[l?n.jsxs("span",{style:Po,onClick:()=>a==null?void 0:a(l),title:"Pulsa para seleccionar en el editor",children:["🟢 Entregado en: ",n.jsx("b",{children:l.title||`Nodo #${l.index+1}`})]}):n.jsx("span",{style:rp,children:"⚠️ Sin nodo en mapa (nadie lo entrega)"}),d.length>0?n.jsxs("span",{style:lp,children:["🔒 Requerido en ",d.length," nodo(s)"]}):null]})]},o.id)})})]})]})}const Qu={display:"flex",flexDirection:"column",gap:20,color:"#f8fafc"},No={display:"flex",flexDirection:"column",gap:8},Eo={margin:0,fontSize:"15px",fontWeight:900,color:"#60a5fa",textTransform:"uppercase",letterSpacing:"0.05em"},Ro={margin:0,fontSize:"11px",color:"rgba(203, 213, 225, 0.74)",lineHeight:1.35},Mo={display:"flex",flexDirection:"column",gap:10},Vu={padding:12,borderRadius:16,border:"1px solid rgba(148, 163, 184, 0.14)",background:"rgba(15, 23, 42, 0.36)"},Uu={display:"flex",alignItems:"center",gap:10},Ku={display:"block",fontSize:"13px",fontWeight:800},Ju={display:"block",fontSize:"9px",color:"#93c5fd"},Yu={margin:"8px 0 0",fontSize:"11px",color:"rgba(226, 232, 240, 0.84)",lineHeight:1.3},Zu={padding:14,borderRadius:16,border:"1px solid rgba(148, 163, 184, 0.14)",background:"rgba(15, 23, 42, 0.36)"},Xu={margin:"0 0 10px",fontSize:"13px",fontWeight:800},ep={display:"flex",alignItems:"center",justifyContent:"space-between",gap:8},zo={flex:1,display:"flex",flexDirection:"column",gap:4},qo={fontSize:"8px",fontWeight:900,color:"rgba(203, 213, 225, 0.5)",letterSpacing:"0.08em"},Ao={display:"flex",justifyContent:"space-between",fontSize:"11px"},tp={color:"#86efac",fontWeight:800},np={fontSize:"16px",color:"rgba(203, 213, 225, 0.3)"},ap={padding:"5px 10px",borderRadius:8,border:"1px solid rgba(56, 189, 248, 0.4)",background:"rgba(14, 165, 233, 0.18)",color:"#38bdf8",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"},ip={padding:"4px 9px",borderRadius:8,border:"1px solid rgba(251, 191, 36, 0.4)",background:"rgba(245, 158, 11, 0.18)",color:"#fbbf24",fontSize:10,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"},op={marginTop:8,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"},Po={fontSize:10,fontWeight:800,color:"#4ade80",background:"rgba(34, 197, 94, 0.12)",border:"1px solid rgba(34, 197, 94, 0.25)",borderRadius:6,padding:"3px 8px",cursor:"pointer"},rp={fontSize:10,fontWeight:800,color:"#fca5a5",background:"rgba(239, 68, 68, 0.12)",border:"1px solid rgba(239, 68, 68, 0.25)",borderRadius:6,padding:"3px 8px"},lp={fontSize:10,fontWeight:800,color:"#93c5fd",background:"rgba(59, 130, 246, 0.12)",border:"1px solid rgba(59, 130, 246, 0.25)",borderRadius:6,padding:"3px 8px"};function sp({onClose:e}){const[t,a]=S.useState(!1);S.useEffect(()=>{a(!0)},[]);const i=n.jsx("div",{style:dp,onClick:e,role:"dialog","aria-modal":"true",children:n.jsxs("div",{style:cp,onClick:r=>r.stopPropagation(),children:[n.jsxs("header",{style:up,children:[n.jsxs("div",{children:[n.jsx("span",{style:pp,children:"🚀 SAGA ENGINE RELEASE NOTES"}),n.jsx("h2",{style:mp,children:"Novedades de las Versiones"})]}),n.jsx("button",{type:"button",style:gp,onClick:e,children:"✕"})]}),n.jsxs("div",{style:fp,children:[n.jsxs("article",{style:wn,children:[n.jsxs("div",{style:kn,children:[n.jsx("span",{style:pl,children:"v3.9.8"}),n.jsx("span",{style:Sn,children:"31 de Julio, 2026"}),n.jsx("span",{style:hp,children:"VERSIÓN ACTUAL"})]}),n.jsx("h3",{style:Cn,children:"🚀 Consolidación de mejoras QR físicas, Leaflet, rutas OSM y HUD"}),n.jsxs("ul",{style:Nn,children:[n.jsxs("li",{children:[n.jsx("strong",{children:"🏷️ QR físicos y edición unificada:"})," Rediseño de tarjetas QR físicas, títulos editables desde el editor principal y correcciones de impresión para que payloads y nodos físicos coincidan."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🗺️ Leaflet, zoom y senderos OSM:"})," Correcciones de clipping, uso de renderer específico y ",n.jsx("code",{children:"noClip"})," para estabilizar rutas, senderos amarillos y capas base a cualquier zoom."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"📍 Edición de rutas más precisa:"})," Inserción correcta de waypoints al arrastrar líneas, actualización dinámica de rutas al hacer pan y basemap OSM estándar en el admin."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"⚡ HUD y playback en tiempo real:"})," Reproducción animada de ruta con marcador Leaflet y sincronización instantánea de distancia y métricas mientras se arrastran nodos."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🌐 Contenido y robustez:"})," Texto narrativo en gallego para stages, perfil OSRM en modo peatón y fixes TypeScript en impresión QR y canvas renderer."]})]})]}),n.jsxs("article",{style:wn,children:[n.jsxs("div",{style:kn,children:[n.jsx("span",{style:Zn,children:"v3.9.5"}),n.jsx("span",{style:Sn,children:"30 de Julio, 2026"})]}),n.jsx("h3",{style:Cn,children:"✨ Resolución de PRs, lockfile auto-sync, mapa 60 FPS y HUD compacto"}),n.jsxs("ul",{style:Nn,children:[n.jsxs("li",{children:[n.jsx("strong",{children:"🔁 Resolución de PRs y estabilidad general:"})," Integración de correcciones pendientes para dejar la rama alineada tras la tanda de pull requests."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"📦 Lockfile auto-sync:"})," Sincronización automática del lockfile para evitar desajustes entre dependencias instaladas y despliegues."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🗺️ Mapa más fluido:"})," Ajustes de rendimiento para acercar el editor a 60 FPS y soporte visual para senderos OSM."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🧭 HUD compacto:"})," Refinamiento del HUD para mostrar mejor la información clave ocupando menos espacio en pantalla."]})]})]}),n.jsxs("article",{style:wn,children:[n.jsxs("div",{style:kn,children:[n.jsx("span",{style:Zn,children:"v3.9.4"}),n.jsx("span",{style:Sn,children:"29 de Julio, 2026"})]}),n.jsx("h3",{style:Cn,children:"🌲 Motor de Rutas Multinodo, Pegatinas QR Personalizables y Sincronización SQLite"}),n.jsxs("ul",{style:Nn,children:[n.jsxs("li",{children:[n.jsx("strong",{children:"🗺️ Motor de Rutas Multinodo:"})," Configuración mística con coleccionables de mochila y minijuegos activos."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🖨️ Pegatinas QR Personalizables:"})," Generador ultra-limpio con selector de multiplicador (1x, 2x, 4x, 6x, 8x copias) y códigos independientes del orden."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🗄️ Persistencia SQLite en Producción:"})," Sincronización bi-direccional en tiempo real y corrección de permisos de archivo en la Raspberry Pi."]})]})]}),n.jsxs("article",{style:wn,children:[n.jsxs("div",{style:kn,children:[n.jsx("span",{style:Zn,children:"v3.9.2"}),n.jsx("span",{style:Sn,children:"24 de Julio, 2026"})]}),n.jsx("h3",{style:Cn,children:"🔮 10 Recetas Temáticas, Colocación de Chinchetas e i18n Gallego 100%"}),n.jsxs("ul",{style:Nn,children:[n.jsxs("li",{children:[n.jsx("strong",{children:"🔮 10 Recetas Temáticas Completas:"})," Recetas ampliadas en 3 familias de juego:",n.jsxs("ul",{style:bp,children:[n.jsxs("li",{children:[n.jsx("b",{children:"🚀 Tecnología / Sci-Fi:"})," Reparar Llave Maestra, Carga EMP, Decodificador Cuántico, Escáner Biométrico."]}),n.jsxs("li",{children:[n.jsx("b",{children:"🛡️ Medieval / Fantasía:"})," Amuleto del Guardián, Elixir de Alquimia, Escudo Rúnico."]}),n.jsxs("li",{children:[n.jsx("b",{children:"🔮 Místico / Oculto:"})," Orbe de Fuego Arcano, Reliquia Sagrada, Amuleto de Visión Suprema."]})]})]}),n.jsxs("li",{children:[n.jsx("strong",{children:"📍 Colocación Interactivas de Chinchetas:"})," Generación paso a paso de chinchetas en el mapa (1/2, 2/2) con confirmación sin modales molestos."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🌐 Traducción Gallego 100% Bi-direccional:"})," Cambio instantáneo entre Español y Gallego sin textos atascados."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"💻 Panel Flotante Ampliado en PC:"})," Ancho de 1180px con organización de jugadores y objetos en rejilla de 2 a 3 columnas."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🎒 Vaciar Mochila y Gestión de Objetos:"})," Acción para vaciar mochila completa o retirar objetos específicos de jugadores en directo."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"📸 Cámara Glassmorphic:"})," UI pulida de cámara en directo con selector frontal/trasera y visor libre de bordes sobrantes."]})]})]}),n.jsxs("article",{style:wn,children:[n.jsxs("div",{style:kn,children:[n.jsx("span",{style:Zn,children:"v3.4.0"}),n.jsx("span",{style:Sn,children:"20 de Julio, 2026"})]}),n.jsx("h3",{style:Cn,children:"📍 Cono de Dirección GPS, Caché PWA y Memoria de Sesión"}),n.jsxs("ul",{style:Nn,children:[n.jsxs("li",{children:[n.jsx("strong",{children:"🧭 Cono de Dirección y Orientación GPS:"})," Visualización en tiempo real de la dirección del jugador en el mapa mediante un cono azul translucido."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"📱 PWA Cache Revamp:"})," Sistema de almacenamiento offline optimizado para precargar mapas y activos sin conexión a internet."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🔒 Memoria de Sesión de Jugador:"})," Persistencia del login de jugador activo tras recargar o reabrir la app."]}),n.jsxs("li",{children:[n.jsx("strong",{children:"🛡️ Validación de Rutas de Receta:"})," El comprobador del Admin verifica automáticamente que existan todos los ingredientes en el mapa antes de guardar."]})]})]})]})]})});return!t||typeof document>"u"?null:ws.createPortal(i,document.body)}const dp={position:"fixed",top:0,left:0,right:0,bottom:0,width:"100vw",height:"100vh",zIndex:99999999,background:"rgba(11, 17, 32, 0.85)",backdropFilter:"blur(10px)",display:"grid",placeItems:"center",padding:16},cp={width:"100%",maxWidth:780,maxHeight:"88vh",display:"flex",flexDirection:"column",background:"linear-gradient(145deg, #0f172a 0%, #1e293b 100%)",borderRadius:24,border:"1px solid rgba(148, 163, 184, 0.2)",boxShadow:"0 25px 50px -12px rgba(0, 0, 0, 0.6)",overflow:"hidden"},up={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 24px",borderBottom:"1px solid rgba(255, 255, 255, 0.08)"},pp={fontSize:"10px",fontWeight:800,letterSpacing:"0.08em",color:"#38bdf8"},mp={margin:"4px 0 0",fontSize:"20px",fontWeight:800,color:"#f8fafc"},gp={background:"rgba(255, 255, 255, 0.06)",border:"none",color:"#94a3b8",width:36,height:36,borderRadius:18,fontSize:"16px",cursor:"pointer",display:"grid",placeItems:"center"},fp={padding:24,overflowY:"auto",display:"flex",flexDirection:"column",gap:24},wn={background:"rgba(255, 255, 255, 0.03)",border:"1px solid rgba(255, 255, 255, 0.08)",borderRadius:16,padding:20},kn={display:"flex",alignItems:"center",gap:10,marginBottom:10},pl={padding:"3px 10px",borderRadius:12,background:"linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)",color:"#ffffff",fontWeight:800,fontSize:"12px"},Zn={...pl,background:"rgba(148, 163, 184, 0.2)",color:"#cbd5e1"},Sn={fontSize:"12px",color:"#94a3b8"},hp={fontSize:"10px",fontWeight:800,color:"#4ade80",background:"rgba(74, 222, 128, 0.12)",border:"1px solid rgba(74, 222, 128, 0.3)",padding:"2px 8px",borderRadius:8},Cn={margin:"0 0 14px",fontSize:"18px",fontWeight:800,color:"#e2e8f0"},Nn={margin:0,paddingLeft:18,color:"#cbd5e1",display:"grid",gap:8,lineHeight:1.55},bp={marginTop:8,paddingLeft:18,display:"grid",gap:4};var pn={};/**
 * @license React
 * react-dom-server-legacy.browser.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var ml=S;function re(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,a=1;a<arguments.length;a++)t+="&args[]="+encodeURIComponent(arguments[a]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var ht=Object.prototype.hasOwnProperty,xp=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,Io={},Lo={};function gl(e){return ht.call(Lo,e)?!0:ht.call(Io,e)?!1:xp.test(e)?Lo[e]=!0:(Io[e]=!0,!1)}function ut(e,t,a,i,r,o,l){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=i,this.attributeNamespace=r,this.mustUseProperty=a,this.propertyName=e,this.type=t,this.sanitizeURL=o,this.removeEmptyString=l}var at={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){at[e]=new ut(e,0,!1,e,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];at[t]=new ut(t,1,!1,e[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(e){at[e]=new ut(e,2,!1,e.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){at[e]=new ut(e,2,!1,e,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){at[e]=new ut(e,3,!1,e.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(e){at[e]=new ut(e,3,!0,e,null,!1,!1)});["capture","download"].forEach(function(e){at[e]=new ut(e,4,!1,e,null,!1,!1)});["cols","rows","size","span"].forEach(function(e){at[e]=new ut(e,6,!1,e,null,!1,!1)});["rowSpan","start"].forEach(function(e){at[e]=new ut(e,5,!1,e.toLowerCase(),null,!1,!1)});var Pi=/[\-:]([a-z])/g;function Ii(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(Pi,Ii);at[t]=new ut(t,1,!1,e,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(Pi,Ii);at[t]=new ut(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(Pi,Ii);at[t]=new ut(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(e){at[e]=new ut(e,1,!1,e.toLowerCase(),null,!1,!1)});at.xlinkHref=new ut("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(e){at[e]=new ut(e,1,!1,e.toLowerCase(),null,!0,!0)});var oa={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},yp=["Webkit","ms","Moz","O"];Object.keys(oa).forEach(function(e){yp.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),oa[t]=oa[e]})});var _p=/["'&<>]/;function ct(e){if(typeof e=="boolean"||typeof e=="number")return""+e;e=""+e;var t=_p.exec(e);if(t){var a="",i,r=0;for(i=t.index;i<e.length;i++){switch(e.charCodeAt(i)){case 34:t="&quot;";break;case 38:t="&amp;";break;case 39:t="&#x27;";break;case 60:t="&lt;";break;case 62:t="&gt;";break;default:continue}r!==i&&(a+=e.substring(r,i)),r=i+1,a+=t}e=r!==i?a+e.substring(r,i):a}return e}var vp=/([A-Z])/g,jp=/^ms-/,bi=Array.isArray;function It(e,t){return{insertionMode:e,selectedValue:t}}function wp(e,t,a){switch(t){case"select":return It(1,a.value!=null?a.value:a.defaultValue);case"svg":return It(2,null);case"math":return It(3,null);case"foreignObject":return It(1,null);case"table":return It(4,null);case"thead":case"tbody":case"tfoot":return It(5,null);case"colgroup":return It(7,null);case"tr":return It(6,null)}return 4<=e.insertionMode||e.insertionMode===0?It(1,null):e}var $o=new Map;function fl(e,t,a){if(typeof a!="object")throw Error(re(62));t=!0;for(var i in a)if(ht.call(a,i)){var r=a[i];if(r!=null&&typeof r!="boolean"&&r!==""){if(i.indexOf("--")===0){var o=ct(i);r=ct((""+r).trim())}else{o=i;var l=$o.get(o);l!==void 0||(l=ct(o.replace(vp,"-$1").toLowerCase().replace(jp,"-ms-")),$o.set(o,l)),o=l,r=typeof r=="number"?r===0||ht.call(oa,i)?""+r:r+"px":ct((""+r).trim())}t?(t=!1,e.push(' style="',o,":",r)):e.push(";",o,":",r)}}t||e.push('"')}function yt(e,t,a,i){switch(a){case"style":fl(e,t,i);return;case"defaultValue":case"defaultChecked":case"innerHTML":case"suppressContentEditableWarning":case"suppressHydrationWarning":return}if(!(2<a.length)||a[0]!=="o"&&a[0]!=="O"||a[1]!=="n"&&a[1]!=="N"){if(t=at.hasOwnProperty(a)?at[a]:null,t!==null){switch(typeof i){case"function":case"symbol":return;case"boolean":if(!t.acceptsBooleans)return}switch(a=t.attributeName,t.type){case 3:i&&e.push(" ",a,'=""');break;case 4:i===!0?e.push(" ",a,'=""'):i!==!1&&e.push(" ",a,'="',ct(i),'"');break;case 5:isNaN(i)||e.push(" ",a,'="',ct(i),'"');break;case 6:!isNaN(i)&&1<=i&&e.push(" ",a,'="',ct(i),'"');break;default:t.sanitizeURL&&(i=""+i),e.push(" ",a,'="',ct(i),'"')}}else if(gl(a)){switch(typeof i){case"function":case"symbol":return;case"boolean":if(t=a.toLowerCase().slice(0,5),t!=="data-"&&t!=="aria-")return}e.push(" ",a,'="',ct(i),'"')}}}function ra(e,t,a){if(t!=null){if(a!=null)throw Error(re(60));if(typeof t!="object"||!("__html"in t))throw Error(re(61));t=t.__html,t!=null&&e.push(""+t)}}function kp(e){var t="";return ml.Children.forEach(e,function(a){a!=null&&(t+=a)}),t}function ti(e,t,a,i){e.push(zt(a));var r=a=null,o;for(o in t)if(ht.call(t,o)){var l=t[o];if(l!=null)switch(o){case"children":a=l;break;case"dangerouslySetInnerHTML":r=l;break;default:yt(e,i,o,l)}}return e.push(">"),ra(e,r,a),typeof a=="string"?(e.push(ct(a)),null):a}var Sp=/^[a-zA-Z][a-zA-Z:_\.\-\d]*$/,To=new Map;function zt(e){var t=To.get(e);if(t===void 0){if(!Sp.test(e))throw Error(re(65,e));t="<"+e,To.set(e,t)}return t}function Cp(e,t,a,i,r){switch(t){case"select":e.push(zt("select"));var o=null,l=null;for(u in a)if(ht.call(a,u)){var d=a[u];if(d!=null)switch(u){case"children":o=d;break;case"dangerouslySetInnerHTML":l=d;break;case"defaultValue":case"value":break;default:yt(e,i,u,d)}}return e.push(">"),ra(e,l,o),o;case"option":l=r.selectedValue,e.push(zt("option"));var s=d=null,c=null,u=null;for(o in a)if(ht.call(a,o)){var p=a[o];if(p!=null)switch(o){case"children":d=p;break;case"selected":c=p;break;case"dangerouslySetInnerHTML":u=p;break;case"value":s=p;default:yt(e,i,o,p)}}if(l!=null)if(a=s!==null?""+s:kp(d),bi(l)){for(i=0;i<l.length;i++)if(""+l[i]===a){e.push(' selected=""');break}}else""+l===a&&e.push(' selected=""');else c&&e.push(' selected=""');return e.push(">"),ra(e,u,d),d;case"textarea":e.push(zt("textarea")),u=l=o=null;for(d in a)if(ht.call(a,d)&&(s=a[d],s!=null))switch(d){case"children":u=s;break;case"value":o=s;break;case"defaultValue":l=s;break;case"dangerouslySetInnerHTML":throw Error(re(91));default:yt(e,i,d,s)}if(o===null&&l!==null&&(o=l),e.push(">"),u!=null){if(o!=null)throw Error(re(92));if(bi(u)&&1<u.length)throw Error(re(93));o=""+u}return typeof o=="string"&&o[0]===`
`&&e.push(`
`),o!==null&&e.push(ct(""+o)),null;case"input":e.push(zt("input")),s=u=d=o=null;for(l in a)if(ht.call(a,l)&&(c=a[l],c!=null))switch(l){case"children":case"dangerouslySetInnerHTML":throw Error(re(399,"input"));case"defaultChecked":s=c;break;case"defaultValue":d=c;break;case"checked":u=c;break;case"value":o=c;break;default:yt(e,i,l,c)}return u!==null?yt(e,i,"checked",u):s!==null&&yt(e,i,"checked",s),o!==null?yt(e,i,"value",o):d!==null&&yt(e,i,"value",d),e.push("/>"),null;case"menuitem":e.push(zt("menuitem"));for(var m in a)if(ht.call(a,m)&&(o=a[m],o!=null))switch(m){case"children":case"dangerouslySetInnerHTML":throw Error(re(400));default:yt(e,i,m,o)}return e.push(">"),null;case"title":e.push(zt("title")),o=null;for(p in a)if(ht.call(a,p)&&(l=a[p],l!=null))switch(p){case"children":o=l;break;case"dangerouslySetInnerHTML":throw Error(re(434));default:yt(e,i,p,l)}return e.push(">"),o;case"listing":case"pre":e.push(zt(t)),l=o=null;for(s in a)if(ht.call(a,s)&&(d=a[s],d!=null))switch(s){case"children":o=d;break;case"dangerouslySetInnerHTML":l=d;break;default:yt(e,i,s,d)}if(e.push(">"),l!=null){if(o!=null)throw Error(re(60));if(typeof l!="object"||!("__html"in l))throw Error(re(61));a=l.__html,a!=null&&(typeof a=="string"&&0<a.length&&a[0]===`
`?e.push(`
`,a):e.push(""+a))}return typeof o=="string"&&o[0]===`
`&&e.push(`
`),o;case"area":case"base":case"br":case"col":case"embed":case"hr":case"img":case"keygen":case"link":case"meta":case"param":case"source":case"track":case"wbr":e.push(zt(t));for(var y in a)if(ht.call(a,y)&&(o=a[y],o!=null))switch(y){case"children":case"dangerouslySetInnerHTML":throw Error(re(399,t));default:yt(e,i,y,o)}return e.push("/>"),null;case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return ti(e,a,t,i);case"html":return r.insertionMode===0&&e.push("<!DOCTYPE html>"),ti(e,a,t,i);default:if(t.indexOf("-")===-1&&typeof a.is!="string")return ti(e,a,t,i);e.push(zt(t)),l=o=null;for(c in a)if(ht.call(a,c)&&(d=a[c],d!=null))switch(c){case"children":o=d;break;case"dangerouslySetInnerHTML":l=d;break;case"style":fl(e,i,d);break;case"suppressContentEditableWarning":case"suppressHydrationWarning":break;default:gl(c)&&typeof d!="function"&&typeof d!="symbol"&&e.push(" ",c,'="',ct(d),'"')}return e.push(">"),ra(e,l,o),o}}function Fo(e,t,a){if(e.push('<!--$?--><template id="'),a===null)throw Error(re(395));return e.push(a),e.push('"></template>')}function Np(e,t,a,i){switch(a.insertionMode){case 0:case 1:return e.push('<div hidden id="'),e.push(t.segmentPrefix),t=i.toString(16),e.push(t),e.push('">');case 2:return e.push('<svg aria-hidden="true" style="display:none" id="'),e.push(t.segmentPrefix),t=i.toString(16),e.push(t),e.push('">');case 3:return e.push('<math aria-hidden="true" style="display:none" id="'),e.push(t.segmentPrefix),t=i.toString(16),e.push(t),e.push('">');case 4:return e.push('<table hidden id="'),e.push(t.segmentPrefix),t=i.toString(16),e.push(t),e.push('">');case 5:return e.push('<table hidden><tbody id="'),e.push(t.segmentPrefix),t=i.toString(16),e.push(t),e.push('">');case 6:return e.push('<table hidden><tr id="'),e.push(t.segmentPrefix),t=i.toString(16),e.push(t),e.push('">');case 7:return e.push('<table hidden><colgroup id="'),e.push(t.segmentPrefix),t=i.toString(16),e.push(t),e.push('">');default:throw Error(re(397))}}function Ep(e,t){switch(t.insertionMode){case 0:case 1:return e.push("</div>");case 2:return e.push("</svg>");case 3:return e.push("</math>");case 4:return e.push("</table>");case 5:return e.push("</tbody></table>");case 6:return e.push("</tr></table>");case 7:return e.push("</colgroup></table>");default:throw Error(re(397))}}var Rp=/[<\u2028\u2029]/g;function ni(e){return JSON.stringify(e).replace(Rp,function(t){switch(t){case"<":return"\\u003c";case"\u2028":return"\\u2028";case"\u2029":return"\\u2029";default:throw Error("escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React")}})}function Mp(e,t){return t=t===void 0?"":t,{bootstrapChunks:[],startInlineScript:"<script>",placeholderPrefix:t+"P:",segmentPrefix:t+"S:",boundaryPrefix:t+"B:",idPrefix:t,nextSuspenseID:0,sentCompleteSegmentFunction:!1,sentCompleteBoundaryFunction:!1,sentClientRenderFunction:!1,generateStaticMarkup:e}}function Do(e,t,a,i){return a.generateStaticMarkup?(e.push(ct(t)),!1):(t===""?e=i:(i&&e.push("<!-- -->"),e.push(ct(t)),e=!0),e)}var $n=Object.assign,zp=Symbol.for("react.element"),hl=Symbol.for("react.portal"),bl=Symbol.for("react.fragment"),xl=Symbol.for("react.strict_mode"),yl=Symbol.for("react.profiler"),_l=Symbol.for("react.provider"),vl=Symbol.for("react.context"),jl=Symbol.for("react.forward_ref"),wl=Symbol.for("react.suspense"),kl=Symbol.for("react.suspense_list"),Sl=Symbol.for("react.memo"),Li=Symbol.for("react.lazy"),qp=Symbol.for("react.scope"),Ap=Symbol.for("react.debug_trace_mode"),Pp=Symbol.for("react.legacy_hidden"),Ip=Symbol.for("react.default_value"),Oo=Symbol.iterator;function xi(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case bl:return"Fragment";case hl:return"Portal";case yl:return"Profiler";case xl:return"StrictMode";case wl:return"Suspense";case kl:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case vl:return(e.displayName||"Context")+".Consumer";case _l:return(e._context.displayName||"Context")+".Provider";case jl:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Sl:return t=e.displayName||null,t!==null?t:xi(e.type)||"Memo";case Li:t=e._payload,e=e._init;try{return xi(e(t))}catch{}}return null}var Cl={};function Bo(e,t){if(e=e.contextTypes,!e)return Cl;var a={},i;for(i in e)a[i]=t[i];return a}var Xt=null;function Pa(e,t){if(e!==t){e.context._currentValue2=e.parentValue,e=e.parent;var a=t.parent;if(e===null){if(a!==null)throw Error(re(401))}else{if(a===null)throw Error(re(401));Pa(e,a)}t.context._currentValue2=t.value}}function Nl(e){e.context._currentValue2=e.parentValue,e=e.parent,e!==null&&Nl(e)}function El(e){var t=e.parent;t!==null&&El(t),e.context._currentValue2=e.value}function Rl(e,t){if(e.context._currentValue2=e.parentValue,e=e.parent,e===null)throw Error(re(402));e.depth===t.depth?Pa(e,t):Rl(e,t)}function Ml(e,t){var a=t.parent;if(a===null)throw Error(re(402));e.depth===a.depth?Pa(e,a):Ml(e,a),t.context._currentValue2=t.value}function va(e){var t=Xt;t!==e&&(t===null?El(e):e===null?Nl(t):t.depth===e.depth?Pa(t,e):t.depth>e.depth?Rl(t,e):Ml(t,e),Xt=e)}var Go={isMounted:function(){return!1},enqueueSetState:function(e,t){e=e._reactInternals,e.queue!==null&&e.queue.push(t)},enqueueReplaceState:function(e,t){e=e._reactInternals,e.replace=!0,e.queue=[t]},enqueueForceUpdate:function(){}};function Ho(e,t,a,i){var r=e.state!==void 0?e.state:null;e.updater=Go,e.props=a,e.state=r;var o={queue:[],replace:!1};e._reactInternals=o;var l=t.contextType;if(e.context=typeof l=="object"&&l!==null?l._currentValue2:i,l=t.getDerivedStateFromProps,typeof l=="function"&&(l=l(a,r),r=l==null?r:$n({},r,l),e.state=r),typeof t.getDerivedStateFromProps!="function"&&typeof e.getSnapshotBeforeUpdate!="function"&&(typeof e.UNSAFE_componentWillMount=="function"||typeof e.componentWillMount=="function"))if(t=e.state,typeof e.componentWillMount=="function"&&e.componentWillMount(),typeof e.UNSAFE_componentWillMount=="function"&&e.UNSAFE_componentWillMount(),t!==e.state&&Go.enqueueReplaceState(e,e.state,null),o.queue!==null&&0<o.queue.length)if(t=o.queue,l=o.replace,o.queue=null,o.replace=!1,l&&t.length===1)e.state=t[0];else{for(o=l?t[0]:e.state,r=!0,l=l?1:0;l<t.length;l++){var d=t[l];d=typeof d=="function"?d.call(e,o,a,i):d,d!=null&&(r?(r=!1,o=$n({},o,d)):$n(o,d))}e.state=o}else o.queue=null}var Lp={id:1,overflow:""};function yi(e,t,a){var i=e.id;e=e.overflow;var r=32-la(i)-1;i&=~(1<<r),a+=1;var o=32-la(t)+r;if(30<o){var l=r-r%5;return o=(i&(1<<l)-1).toString(32),i>>=l,r-=l,{id:1<<32-la(t)+r|a<<r|i,overflow:o+e}}return{id:1<<o|a<<r|i,overflow:e}}var la=Math.clz32?Math.clz32:Fp,$p=Math.log,Tp=Math.LN2;function Fp(e){return e>>>=0,e===0?32:31-($p(e)/Tp|0)|0}function Dp(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var Op=typeof Object.is=="function"?Object.is:Dp,Lt=null,$i=null,sa=null,Ie=null,Mn=!1,ja=!1,Dn=0,Gt=null,Ia=0;function Jt(){if(Lt===null)throw Error(re(321));return Lt}function Wo(){if(0<Ia)throw Error(re(312));return{memoizedState:null,queue:null,next:null}}function Ti(){return Ie===null?sa===null?(Mn=!1,sa=Ie=Wo()):(Mn=!0,Ie=sa):Ie.next===null?(Mn=!1,Ie=Ie.next=Wo()):(Mn=!0,Ie=Ie.next),Ie}function Fi(){$i=Lt=null,ja=!1,sa=null,Ia=0,Ie=Gt=null}function zl(e,t){return typeof t=="function"?t(e):t}function Qo(e,t,a){if(Lt=Jt(),Ie=Ti(),Mn){var i=Ie.queue;if(t=i.dispatch,Gt!==null&&(a=Gt.get(i),a!==void 0)){Gt.delete(i),i=Ie.memoizedState;do i=e(i,a.action),a=a.next;while(a!==null);return Ie.memoizedState=i,[i,t]}return[Ie.memoizedState,t]}return e=e===zl?typeof t=="function"?t():t:a!==void 0?a(t):t,Ie.memoizedState=e,e=Ie.queue={last:null,dispatch:null},e=e.dispatch=Bp.bind(null,Lt,e),[Ie.memoizedState,e]}function Vo(e,t){if(Lt=Jt(),Ie=Ti(),t=t===void 0?null:t,Ie!==null){var a=Ie.memoizedState;if(a!==null&&t!==null){var i=a[1];e:if(i===null)i=!1;else{for(var r=0;r<i.length&&r<t.length;r++)if(!Op(t[r],i[r])){i=!1;break e}i=!0}if(i)return a[0]}}return e=e(),Ie.memoizedState=[e,t],e}function Bp(e,t,a){if(25<=Ia)throw Error(re(301));if(e===Lt)if(ja=!0,e={action:a,next:null},Gt===null&&(Gt=new Map),a=Gt.get(t),a===void 0)Gt.set(t,e);else{for(t=a;t.next!==null;)t=t.next;t.next=e}}function Gp(){throw Error(re(394))}function Xn(){}var Uo={readContext:function(e){return e._currentValue2},useContext:function(e){return Jt(),e._currentValue2},useMemo:Vo,useReducer:Qo,useRef:function(e){Lt=Jt(),Ie=Ti();var t=Ie.memoizedState;return t===null?(e={current:e},Ie.memoizedState=e):t},useState:function(e){return Qo(zl,e)},useInsertionEffect:Xn,useLayoutEffect:function(){},useCallback:function(e,t){return Vo(function(){return e},t)},useImperativeHandle:Xn,useEffect:Xn,useDebugValue:Xn,useDeferredValue:function(e){return Jt(),e},useTransition:function(){return Jt(),[!1,Gp]},useId:function(){var e=$i.treeContext,t=e.overflow;e=e.id,e=(e&~(1<<32-la(e)-1)).toString(32)+t;var a=da;if(a===null)throw Error(re(404));return t=Dn++,e=":"+a.idPrefix+"R"+e,0<t&&(e+="H"+t.toString(32)),e+":"},useMutableSource:function(e,t){return Jt(),t(e._source)},useSyncExternalStore:function(e,t,a){if(a===void 0)throw Error(re(407));return a()}},da=null,ai=ml.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;function Hp(e){return console.error(e),null}function zn(){}function Wp(e,t,a,i,r,o,l,d,s){var c=[],u=new Set;return t={destination:null,responseState:t,progressiveChunkSize:i===void 0?12800:i,status:0,fatalError:null,nextSegmentId:0,allPendingTasks:0,pendingRootTasks:0,completedRootSegment:null,abortableTasks:u,pingedTasks:c,clientRenderedBoundaries:[],completedBoundaries:[],partialBoundaries:[],onError:r===void 0?Hp:r,onAllReady:zn,onShellReady:l===void 0?zn:l,onShellError:zn,onFatalError:zn},a=wa(t,0,null,a,!1,!1),a.parentFlushed=!0,e=Di(t,e,null,a,u,Cl,null,Lp),c.push(e),t}function Di(e,t,a,i,r,o,l,d){e.allPendingTasks++,a===null?e.pendingRootTasks++:a.pendingTasks++;var s={node:t,ping:function(){var c=e.pingedTasks;c.push(s),c.length===1&&Pl(e)},blockedBoundary:a,blockedSegment:i,abortSet:r,legacyContext:o,context:l,treeContext:d};return r.add(s),s}function wa(e,t,a,i,r,o){return{status:0,id:-1,index:t,parentFlushed:!1,chunks:[],children:[],formatContext:i,boundary:a,lastPushedText:r,textEmbedded:o}}function On(e,t){if(e=e.onError(t),e!=null&&typeof e!="string")throw Error('onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "'+typeof e+'" instead');return e}function ka(e,t){var a=e.onShellError;a(t),a=e.onFatalError,a(t),e.destination!==null?(e.status=2,e.destination.destroy(t)):(e.status=1,e.fatalError=t)}function Ko(e,t,a,i,r){for(Lt={},$i=t,Dn=0,e=a(i,r);ja;)ja=!1,Dn=0,Ia+=1,Ie=null,e=a(i,r);return Fi(),e}function Jo(e,t,a,i){var r=a.render(),o=i.childContextTypes;if(o!=null){var l=t.legacyContext;if(typeof a.getChildContext!="function")i=l;else{a=a.getChildContext();for(var d in a)if(!(d in o))throw Error(re(108,xi(i)||"Unknown",d));i=$n({},l,a)}t.legacyContext=i,vt(e,t,r),t.legacyContext=l}else vt(e,t,r)}function Yo(e,t){if(e&&e.defaultProps){t=$n({},t),e=e.defaultProps;for(var a in e)t[a]===void 0&&(t[a]=e[a]);return t}return t}function _i(e,t,a,i,r){if(typeof a=="function")if(a.prototype&&a.prototype.isReactComponent){r=Bo(a,t.legacyContext);var o=a.contextType;o=new a(i,typeof o=="object"&&o!==null?o._currentValue2:r),Ho(o,a,i,r),Jo(e,t,o,a)}else{o=Bo(a,t.legacyContext),r=Ko(e,t,a,i,o);var l=Dn!==0;if(typeof r=="object"&&r!==null&&typeof r.render=="function"&&r.$$typeof===void 0)Ho(r,a,i,o),Jo(e,t,r,a);else if(l){i=t.treeContext,t.treeContext=yi(i,1,0);try{vt(e,t,r)}finally{t.treeContext=i}}else vt(e,t,r)}else if(typeof a=="string"){switch(r=t.blockedSegment,o=Cp(r.chunks,a,i,e.responseState,r.formatContext),r.lastPushedText=!1,l=r.formatContext,r.formatContext=wp(l,a,i),vi(e,t,o),r.formatContext=l,a){case"area":case"base":case"br":case"col":case"embed":case"hr":case"img":case"input":case"keygen":case"link":case"meta":case"param":case"source":case"track":case"wbr":break;default:r.chunks.push("</",a,">")}r.lastPushedText=!1}else{switch(a){case Pp:case Ap:case xl:case yl:case bl:vt(e,t,i.children);return;case kl:vt(e,t,i.children);return;case qp:throw Error(re(343));case wl:e:{a=t.blockedBoundary,r=t.blockedSegment,o=i.fallback,i=i.children,l=new Set;var d={id:null,rootSegmentID:-1,parentFlushed:!1,pendingTasks:0,forceClientRender:!1,completedSegments:[],byteSize:0,fallbackAbortableTasks:l,errorDigest:null},s=wa(e,r.chunks.length,d,r.formatContext,!1,!1);r.children.push(s),r.lastPushedText=!1;var c=wa(e,0,null,r.formatContext,!1,!1);c.parentFlushed=!0,t.blockedBoundary=d,t.blockedSegment=c;try{if(vi(e,t,i),e.responseState.generateStaticMarkup||c.lastPushedText&&c.textEmbedded&&c.chunks.push("<!-- -->"),c.status=1,Sa(d,c),d.pendingTasks===0)break e}catch(u){c.status=4,d.forceClientRender=!0,d.errorDigest=On(e,u)}finally{t.blockedBoundary=a,t.blockedSegment=r}t=Di(e,o,a,s,l,t.legacyContext,t.context,t.treeContext),e.pingedTasks.push(t)}return}if(typeof a=="object"&&a!==null)switch(a.$$typeof){case jl:if(i=Ko(e,t,a.render,i,r),Dn!==0){a=t.treeContext,t.treeContext=yi(a,1,0);try{vt(e,t,i)}finally{t.treeContext=a}}else vt(e,t,i);return;case Sl:a=a.type,i=Yo(a,i),_i(e,t,a,i,r);return;case _l:if(r=i.children,a=a._context,i=i.value,o=a._currentValue2,a._currentValue2=i,l=Xt,Xt=i={parent:l,depth:l===null?0:l.depth+1,context:a,parentValue:o,value:i},t.context=i,vt(e,t,r),e=Xt,e===null)throw Error(re(403));i=e.parentValue,e.context._currentValue2=i===Ip?e.context._defaultValue:i,e=Xt=e.parent,t.context=e;return;case vl:i=i.children,i=i(a._currentValue2),vt(e,t,i);return;case Li:r=a._init,a=r(a._payload),i=Yo(a,i),_i(e,t,a,i,void 0);return}throw Error(re(130,a==null?a:typeof a,""))}}function vt(e,t,a){if(t.node=a,typeof a=="object"&&a!==null){switch(a.$$typeof){case zp:_i(e,t,a.type,a.props,a.ref);return;case hl:throw Error(re(257));case Li:var i=a._init;a=i(a._payload),vt(e,t,a);return}if(bi(a)){Zo(e,t,a);return}if(a===null||typeof a!="object"?i=null:(i=Oo&&a[Oo]||a["@@iterator"],i=typeof i=="function"?i:null),i&&(i=i.call(a))){if(a=i.next(),!a.done){var r=[];do r.push(a.value),a=i.next();while(!a.done);Zo(e,t,r)}return}throw e=Object.prototype.toString.call(a),Error(re(31,e==="[object Object]"?"object with keys {"+Object.keys(a).join(", ")+"}":e))}typeof a=="string"?(i=t.blockedSegment,i.lastPushedText=Do(t.blockedSegment.chunks,a,e.responseState,i.lastPushedText)):typeof a=="number"&&(i=t.blockedSegment,i.lastPushedText=Do(t.blockedSegment.chunks,""+a,e.responseState,i.lastPushedText))}function Zo(e,t,a){for(var i=a.length,r=0;r<i;r++){var o=t.treeContext;t.treeContext=yi(o,i,r);try{vi(e,t,a[r])}finally{t.treeContext=o}}}function vi(e,t,a){var i=t.blockedSegment.formatContext,r=t.legacyContext,o=t.context;try{return vt(e,t,a)}catch(s){if(Fi(),typeof s=="object"&&s!==null&&typeof s.then=="function"){a=s;var l=t.blockedSegment,d=wa(e,l.chunks.length,null,l.formatContext,l.lastPushedText,!0);l.children.push(d),l.lastPushedText=!1,e=Di(e,t.node,t.blockedBoundary,d,t.abortSet,t.legacyContext,t.context,t.treeContext).ping,a.then(e,e),t.blockedSegment.formatContext=i,t.legacyContext=r,t.context=o,va(o)}else throw t.blockedSegment.formatContext=i,t.legacyContext=r,t.context=o,va(o),s}}function Qp(e){var t=e.blockedBoundary;e=e.blockedSegment,e.status=3,Al(this,t,e)}function ql(e,t,a){var i=e.blockedBoundary;e.blockedSegment.status=3,i===null?(t.allPendingTasks--,t.status!==2&&(t.status=2,t.destination!==null&&t.destination.push(null))):(i.pendingTasks--,i.forceClientRender||(i.forceClientRender=!0,e=a===void 0?Error(re(432)):a,i.errorDigest=t.onError(e),i.parentFlushed&&t.clientRenderedBoundaries.push(i)),i.fallbackAbortableTasks.forEach(function(r){return ql(r,t,a)}),i.fallbackAbortableTasks.clear(),t.allPendingTasks--,t.allPendingTasks===0&&(i=t.onAllReady,i()))}function Sa(e,t){if(t.chunks.length===0&&t.children.length===1&&t.children[0].boundary===null){var a=t.children[0];a.id=t.id,a.parentFlushed=!0,a.status===1&&Sa(e,a)}else e.completedSegments.push(t)}function Al(e,t,a){if(t===null){if(a.parentFlushed){if(e.completedRootSegment!==null)throw Error(re(389));e.completedRootSegment=a}e.pendingRootTasks--,e.pendingRootTasks===0&&(e.onShellError=zn,t=e.onShellReady,t())}else t.pendingTasks--,t.forceClientRender||(t.pendingTasks===0?(a.parentFlushed&&a.status===1&&Sa(t,a),t.parentFlushed&&e.completedBoundaries.push(t),t.fallbackAbortableTasks.forEach(Qp,e),t.fallbackAbortableTasks.clear()):a.parentFlushed&&a.status===1&&(Sa(t,a),t.completedSegments.length===1&&t.parentFlushed&&e.partialBoundaries.push(t)));e.allPendingTasks--,e.allPendingTasks===0&&(e=e.onAllReady,e())}function Pl(e){if(e.status!==2){var t=Xt,a=ai.current;ai.current=Uo;var i=da;da=e.responseState;try{var r=e.pingedTasks,o;for(o=0;o<r.length;o++){var l=r[o],d=e,s=l.blockedSegment;if(s.status===0){va(l.context);try{vt(d,l,l.node),d.responseState.generateStaticMarkup||s.lastPushedText&&s.textEmbedded&&s.chunks.push("<!-- -->"),l.abortSet.delete(l),s.status=1,Al(d,l.blockedBoundary,s)}catch(b){if(Fi(),typeof b=="object"&&b!==null&&typeof b.then=="function"){var c=l.ping;b.then(c,c)}else{l.abortSet.delete(l),s.status=4;var u=l.blockedBoundary,p=b,m=On(d,p);if(u===null?ka(d,p):(u.pendingTasks--,u.forceClientRender||(u.forceClientRender=!0,u.errorDigest=m,u.parentFlushed&&d.clientRenderedBoundaries.push(u))),d.allPendingTasks--,d.allPendingTasks===0){var y=d.onAllReady;y()}}}finally{}}}r.splice(0,o),e.destination!==null&&Oi(e,e.destination)}catch(b){On(e,b),ka(e,b)}finally{da=i,ai.current=a,a===Uo&&va(t)}}}function ea(e,t,a){switch(a.parentFlushed=!0,a.status){case 0:var i=a.id=e.nextSegmentId++;return a.lastPushedText=!1,a.textEmbedded=!1,e=e.responseState,t.push('<template id="'),t.push(e.placeholderPrefix),e=i.toString(16),t.push(e),t.push('"></template>');case 1:a.status=2;var r=!0;i=a.chunks;var o=0;a=a.children;for(var l=0;l<a.length;l++){for(r=a[l];o<r.index;o++)t.push(i[o]);r=La(e,t,r)}for(;o<i.length-1;o++)t.push(i[o]);return o<i.length&&(r=t.push(i[o])),r;default:throw Error(re(390))}}function La(e,t,a){var i=a.boundary;if(i===null)return ea(e,t,a);if(i.parentFlushed=!0,i.forceClientRender)return e.responseState.generateStaticMarkup||(i=i.errorDigest,t.push("<!--$!-->"),t.push("<template"),i&&(t.push(' data-dgst="'),i=ct(i),t.push(i),t.push('"')),t.push("></template>")),ea(e,t,a),e=e.responseState.generateStaticMarkup?!0:t.push("<!--/$-->"),e;if(0<i.pendingTasks){i.rootSegmentID=e.nextSegmentId++,0<i.completedSegments.length&&e.partialBoundaries.push(i);var r=e.responseState,o=r.nextSuspenseID++;return r=r.boundaryPrefix+o.toString(16),i=i.id=r,Fo(t,e.responseState,i),ea(e,t,a),t.push("<!--/$-->")}if(i.byteSize>e.progressiveChunkSize)return i.rootSegmentID=e.nextSegmentId++,e.completedBoundaries.push(i),Fo(t,e.responseState,i.id),ea(e,t,a),t.push("<!--/$-->");if(e.responseState.generateStaticMarkup||t.push("<!--$-->"),a=i.completedSegments,a.length!==1)throw Error(re(391));return La(e,t,a[0]),e=e.responseState.generateStaticMarkup?!0:t.push("<!--/$-->"),e}function Xo(e,t,a){return Np(t,e.responseState,a.formatContext,a.id),La(e,t,a),Ep(t,a.formatContext)}function er(e,t,a){for(var i=a.completedSegments,r=0;r<i.length;r++)Il(e,t,a,i[r]);if(i.length=0,e=e.responseState,i=a.id,a=a.rootSegmentID,t.push(e.startInlineScript),e.sentCompleteBoundaryFunction?t.push('$RC("'):(e.sentCompleteBoundaryFunction=!0,t.push('function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("')),i===null)throw Error(re(395));return a=a.toString(16),t.push(i),t.push('","'),t.push(e.segmentPrefix),t.push(a),t.push('")<\/script>')}function Il(e,t,a,i){if(i.status===2)return!0;var r=i.id;if(r===-1){if((i.id=a.rootSegmentID)===-1)throw Error(re(392));return Xo(e,t,i)}return Xo(e,t,i),e=e.responseState,t.push(e.startInlineScript),e.sentCompleteSegmentFunction?t.push('$RS("'):(e.sentCompleteSegmentFunction=!0,t.push('function $RS(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("')),t.push(e.segmentPrefix),r=r.toString(16),t.push(r),t.push('","'),t.push(e.placeholderPrefix),t.push(r),t.push('")<\/script>')}function Oi(e,t){try{var a=e.completedRootSegment;if(a!==null&&e.pendingRootTasks===0){La(e,t,a),e.completedRootSegment=null;var i=e.responseState.bootstrapChunks;for(a=0;a<i.length-1;a++)t.push(i[a]);a<i.length&&t.push(i[a])}var r=e.clientRenderedBoundaries,o;for(o=0;o<r.length;o++){var l=r[o];i=t;var d=e.responseState,s=l.id,c=l.errorDigest,u=l.errorMessage,p=l.errorComponentStack;if(i.push(d.startInlineScript),d.sentClientRenderFunction?i.push('$RX("'):(d.sentClientRenderFunction=!0,i.push('function $RX(b,c,d,e){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),b._reactRetry&&b._reactRetry())};$RX("')),s===null)throw Error(re(395));if(i.push(s),i.push('"'),c||u||p){i.push(",");var m=ni(c||"");i.push(m)}if(u||p){i.push(",");var y=ni(u||"");i.push(y)}if(p){i.push(",");var b=ni(p);i.push(b)}if(!i.push(")<\/script>")){e.destination=null,o++,r.splice(0,o);return}}r.splice(0,o);var w=e.completedBoundaries;for(o=0;o<w.length;o++)if(!er(e,t,w[o])){e.destination=null,o++,w.splice(0,o);return}w.splice(0,o);var f=e.partialBoundaries;for(o=0;o<f.length;o++){var v=f[o];e:{r=e,l=t;var N=v.completedSegments;for(d=0;d<N.length;d++)if(!Il(r,l,v,N[d])){d++,N.splice(0,d);var h=!1;break e}N.splice(0,d),h=!0}if(!h){e.destination=null,o++,f.splice(0,o);return}}f.splice(0,o);var C=e.completedBoundaries;for(o=0;o<C.length;o++)if(!er(e,t,C[o])){e.destination=null,o++,C.splice(0,o);return}C.splice(0,o)}finally{e.allPendingTasks===0&&e.pingedTasks.length===0&&e.clientRenderedBoundaries.length===0&&e.completedBoundaries.length===0&&t.push(null)}}function Vp(e,t){try{var a=e.abortableTasks;a.forEach(function(i){return ql(i,e,t)}),a.clear(),e.destination!==null&&Oi(e,e.destination)}catch(i){On(e,i),ka(e,i)}}function Up(){}function Ll(e,t,a,i){var r=!1,o=null,l="",d={push:function(c){return c!==null&&(l+=c),!0},destroy:function(c){r=!0,o=c}},s=!1;if(e=Wp(e,Mp(a,t?t.identifierPrefix:void 0),{insertionMode:1,selectedValue:null},1/0,Up,void 0,function(){s=!0}),Pl(e),Vp(e,i),e.status===1)e.status=2,d.destroy(e.fatalError);else if(e.status!==2&&e.destination===null){e.destination=d;try{Oi(e,d)}catch(c){On(e,c),ka(e,c)}}if(r)throw o;if(!s)throw Error(re(426));return l}pn.renderToNodeStream=function(){throw Error(re(207))};pn.renderToStaticMarkup=function(e,t){return Ll(e,t,!0,'The server used "renderToStaticMarkup" which does not support Suspense. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server')};pn.renderToStaticNodeStream=function(){throw Error(re(208))};pn.renderToString=function(e,t){return Ll(e,t,!1,'The server used "renderToString" which does not support Suspense. If you intended for this Suspense boundary to render the fallback content on the server consider throwing an Error somewhere within the Suspense boundary. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server')};pn.version="18.3.1";var Bi={};/**
 * @license React
 * react-dom-server.browser.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var $l=S;function ue(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,a=1;a<arguments.length;a++)t+="&args[]="+encodeURIComponent(arguments[a]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var jt=null,wt=0;function G(e,t){if(t.length!==0)if(512<t.length)0<wt&&(e.enqueue(new Uint8Array(jt.buffer,0,wt)),jt=new Uint8Array(512),wt=0),e.enqueue(t);else{var a=jt.length-wt;a<t.length&&(a===0?e.enqueue(jt):(jt.set(t.subarray(0,a),wt),e.enqueue(jt),t=t.subarray(a)),jt=new Uint8Array(512),wt=0),jt.set(t,wt),wt+=t.length}}function Te(e,t){return G(e,t),!0}function tr(e){jt&&0<wt&&(e.enqueue(new Uint8Array(jt.buffer,0,wt)),jt=null,wt=0)}var Tl=new TextEncoder;function fe(e){return Tl.encode(e)}function D(e){return Tl.encode(e)}function Fl(e,t){typeof e.error=="function"?e.error(t):e.close()}var bt=Object.prototype.hasOwnProperty,Kp=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,nr={},ar={};function Dl(e){return bt.call(ar,e)?!0:bt.call(nr,e)?!1:Kp.test(e)?ar[e]=!0:(nr[e]=!0,!1)}function pt(e,t,a,i,r,o,l){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=i,this.attributeNamespace=r,this.mustUseProperty=a,this.propertyName=e,this.type=t,this.sanitizeURL=o,this.removeEmptyString=l}var it={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){it[e]=new pt(e,0,!1,e,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];it[t]=new pt(t,1,!1,e[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(e){it[e]=new pt(e,2,!1,e.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){it[e]=new pt(e,2,!1,e,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){it[e]=new pt(e,3,!1,e.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(e){it[e]=new pt(e,3,!0,e,null,!1,!1)});["capture","download"].forEach(function(e){it[e]=new pt(e,4,!1,e,null,!1,!1)});["cols","rows","size","span"].forEach(function(e){it[e]=new pt(e,6,!1,e,null,!1,!1)});["rowSpan","start"].forEach(function(e){it[e]=new pt(e,5,!1,e.toLowerCase(),null,!1,!1)});var Gi=/[\-:]([a-z])/g;function Hi(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(Gi,Hi);it[t]=new pt(t,1,!1,e,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(Gi,Hi);it[t]=new pt(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(Gi,Hi);it[t]=new pt(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(e){it[e]=new pt(e,1,!1,e.toLowerCase(),null,!1,!1)});it.xlinkHref=new pt("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(e){it[e]=new pt(e,1,!1,e.toLowerCase(),null,!0,!0)});var ca={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},Jp=["Webkit","ms","Moz","O"];Object.keys(ca).forEach(function(e){Jp.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),ca[t]=ca[e]})});var Yp=/["'&<>]/;function nt(e){if(typeof e=="boolean"||typeof e=="number")return""+e;e=""+e;var t=Yp.exec(e);if(t){var a="",i,r=0;for(i=t.index;i<e.length;i++){switch(e.charCodeAt(i)){case 34:t="&quot;";break;case 38:t="&amp;";break;case 39:t="&#x27;";break;case 60:t="&lt;";break;case 62:t="&gt;";break;default:continue}r!==i&&(a+=e.substring(r,i)),r=i+1,a+=t}e=r!==i?a+e.substring(r,i):a}return e}var Zp=/([A-Z])/g,Xp=/^ms-/,ji=Array.isArray,em=D("<script>"),tm=D("<\/script>"),nm=D('<script src="'),am=D('<script type="module" src="'),ir=D('" async=""><\/script>'),im=/(<\/|<)(s)(cript)/gi;function om(e,t,a,i){return""+t+(a==="s"?"\\u0073":"\\u0053")+i}function rm(e,t,a,i,r){e=e===void 0?"":e,t=t===void 0?em:D('<script nonce="'+nt(t)+'">');var o=[];if(a!==void 0&&o.push(t,fe((""+a).replace(im,om)),tm),i!==void 0)for(a=0;a<i.length;a++)o.push(nm,fe(nt(i[a])),ir);if(r!==void 0)for(i=0;i<r.length;i++)o.push(am,fe(nt(r[i])),ir);return{bootstrapChunks:o,startInlineScript:t,placeholderPrefix:D(e+"P:"),segmentPrefix:D(e+"S:"),boundaryPrefix:e+"B:",idPrefix:e,nextSuspenseID:0,sentCompleteSegmentFunction:!1,sentCompleteBoundaryFunction:!1,sentClientRenderFunction:!1}}function qt(e,t){return{insertionMode:e,selectedValue:t}}function lm(e){return qt(e==="http://www.w3.org/2000/svg"?2:e==="http://www.w3.org/1998/Math/MathML"?3:0,null)}function sm(e,t,a){switch(t){case"select":return qt(1,a.value!=null?a.value:a.defaultValue);case"svg":return qt(2,null);case"math":return qt(3,null);case"foreignObject":return qt(1,null);case"table":return qt(4,null);case"thead":case"tbody":case"tfoot":return qt(5,null);case"colgroup":return qt(7,null);case"tr":return qt(6,null)}return 4<=e.insertionMode||e.insertionMode===0?qt(1,null):e}var Wi=D("<!-- -->");function or(e,t,a,i){return t===""?i:(i&&e.push(Wi),e.push(fe(nt(t))),!0)}var rr=new Map,dm=D(' style="'),lr=D(":"),cm=D(";");function Ol(e,t,a){if(typeof a!="object")throw Error(ue(62));t=!0;for(var i in a)if(bt.call(a,i)){var r=a[i];if(r!=null&&typeof r!="boolean"&&r!==""){if(i.indexOf("--")===0){var o=fe(nt(i));r=fe(nt((""+r).trim()))}else{o=i;var l=rr.get(o);l!==void 0||(l=D(nt(o.replace(Zp,"-$1").toLowerCase().replace(Xp,"-ms-"))),rr.set(o,l)),o=l,r=typeof r=="number"?r===0||bt.call(ca,i)?fe(""+r):fe(r+"px"):fe(nt((""+r).trim()))}t?(t=!1,e.push(dm,o,lr,r)):e.push(cm,o,lr,r)}}t||e.push(Yt)}var Dt=D(" "),dn=D('="'),Yt=D('"'),sr=D('=""');function _t(e,t,a,i){switch(a){case"style":Ol(e,t,i);return;case"defaultValue":case"defaultChecked":case"innerHTML":case"suppressContentEditableWarning":case"suppressHydrationWarning":return}if(!(2<a.length)||a[0]!=="o"&&a[0]!=="O"||a[1]!=="n"&&a[1]!=="N"){if(t=it.hasOwnProperty(a)?it[a]:null,t!==null){switch(typeof i){case"function":case"symbol":return;case"boolean":if(!t.acceptsBooleans)return}switch(a=fe(t.attributeName),t.type){case 3:i&&e.push(Dt,a,sr);break;case 4:i===!0?e.push(Dt,a,sr):i!==!1&&e.push(Dt,a,dn,fe(nt(i)),Yt);break;case 5:isNaN(i)||e.push(Dt,a,dn,fe(nt(i)),Yt);break;case 6:!isNaN(i)&&1<=i&&e.push(Dt,a,dn,fe(nt(i)),Yt);break;default:t.sanitizeURL&&(i=""+i),e.push(Dt,a,dn,fe(nt(i)),Yt)}}else if(Dl(a)){switch(typeof i){case"function":case"symbol":return;case"boolean":if(t=a.toLowerCase().slice(0,5),t!=="data-"&&t!=="aria-")return}e.push(Dt,fe(a),dn,fe(nt(i)),Yt)}}}var Ot=D(">"),dr=D("/>");function ua(e,t,a){if(t!=null){if(a!=null)throw Error(ue(60));if(typeof t!="object"||!("__html"in t))throw Error(ue(61));t=t.__html,t!=null&&e.push(fe(""+t))}}function um(e){var t="";return $l.Children.forEach(e,function(a){a!=null&&(t+=a)}),t}var ii=D(' selected=""');function oi(e,t,a,i){e.push(At(a));var r=a=null,o;for(o in t)if(bt.call(t,o)){var l=t[o];if(l!=null)switch(o){case"children":a=l;break;case"dangerouslySetInnerHTML":r=l;break;default:_t(e,i,o,l)}}return e.push(Ot),ua(e,r,a),typeof a=="string"?(e.push(fe(nt(a))),null):a}var ri=D(`
`),pm=/^[a-zA-Z][a-zA-Z:_\.\-\d]*$/,cr=new Map;function At(e){var t=cr.get(e);if(t===void 0){if(!pm.test(e))throw Error(ue(65,e));t=D("<"+e),cr.set(e,t)}return t}var mm=D("<!DOCTYPE html>");function gm(e,t,a,i,r){switch(t){case"select":e.push(At("select"));var o=null,l=null;for(u in a)if(bt.call(a,u)){var d=a[u];if(d!=null)switch(u){case"children":o=d;break;case"dangerouslySetInnerHTML":l=d;break;case"defaultValue":case"value":break;default:_t(e,i,u,d)}}return e.push(Ot),ua(e,l,o),o;case"option":l=r.selectedValue,e.push(At("option"));var s=d=null,c=null,u=null;for(o in a)if(bt.call(a,o)){var p=a[o];if(p!=null)switch(o){case"children":d=p;break;case"selected":c=p;break;case"dangerouslySetInnerHTML":u=p;break;case"value":s=p;default:_t(e,i,o,p)}}if(l!=null)if(a=s!==null?""+s:um(d),ji(l)){for(i=0;i<l.length;i++)if(""+l[i]===a){e.push(ii);break}}else""+l===a&&e.push(ii);else c&&e.push(ii);return e.push(Ot),ua(e,u,d),d;case"textarea":e.push(At("textarea")),u=l=o=null;for(d in a)if(bt.call(a,d)&&(s=a[d],s!=null))switch(d){case"children":u=s;break;case"value":o=s;break;case"defaultValue":l=s;break;case"dangerouslySetInnerHTML":throw Error(ue(91));default:_t(e,i,d,s)}if(o===null&&l!==null&&(o=l),e.push(Ot),u!=null){if(o!=null)throw Error(ue(92));if(ji(u)&&1<u.length)throw Error(ue(93));o=""+u}return typeof o=="string"&&o[0]===`
`&&e.push(ri),o!==null&&e.push(fe(nt(""+o))),null;case"input":e.push(At("input")),s=u=d=o=null;for(l in a)if(bt.call(a,l)&&(c=a[l],c!=null))switch(l){case"children":case"dangerouslySetInnerHTML":throw Error(ue(399,"input"));case"defaultChecked":s=c;break;case"defaultValue":d=c;break;case"checked":u=c;break;case"value":o=c;break;default:_t(e,i,l,c)}return u!==null?_t(e,i,"checked",u):s!==null&&_t(e,i,"checked",s),o!==null?_t(e,i,"value",o):d!==null&&_t(e,i,"value",d),e.push(dr),null;case"menuitem":e.push(At("menuitem"));for(var m in a)if(bt.call(a,m)&&(o=a[m],o!=null))switch(m){case"children":case"dangerouslySetInnerHTML":throw Error(ue(400));default:_t(e,i,m,o)}return e.push(Ot),null;case"title":e.push(At("title")),o=null;for(p in a)if(bt.call(a,p)&&(l=a[p],l!=null))switch(p){case"children":o=l;break;case"dangerouslySetInnerHTML":throw Error(ue(434));default:_t(e,i,p,l)}return e.push(Ot),o;case"listing":case"pre":e.push(At(t)),l=o=null;for(s in a)if(bt.call(a,s)&&(d=a[s],d!=null))switch(s){case"children":o=d;break;case"dangerouslySetInnerHTML":l=d;break;default:_t(e,i,s,d)}if(e.push(Ot),l!=null){if(o!=null)throw Error(ue(60));if(typeof l!="object"||!("__html"in l))throw Error(ue(61));a=l.__html,a!=null&&(typeof a=="string"&&0<a.length&&a[0]===`
`?e.push(ri,fe(a)):e.push(fe(""+a)))}return typeof o=="string"&&o[0]===`
`&&e.push(ri),o;case"area":case"base":case"br":case"col":case"embed":case"hr":case"img":case"keygen":case"link":case"meta":case"param":case"source":case"track":case"wbr":e.push(At(t));for(var y in a)if(bt.call(a,y)&&(o=a[y],o!=null))switch(y){case"children":case"dangerouslySetInnerHTML":throw Error(ue(399,t));default:_t(e,i,y,o)}return e.push(dr),null;case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return oi(e,a,t,i);case"html":return r.insertionMode===0&&e.push(mm),oi(e,a,t,i);default:if(t.indexOf("-")===-1&&typeof a.is!="string")return oi(e,a,t,i);e.push(At(t)),l=o=null;for(c in a)if(bt.call(a,c)&&(d=a[c],d!=null))switch(c){case"children":o=d;break;case"dangerouslySetInnerHTML":l=d;break;case"style":Ol(e,i,d);break;case"suppressContentEditableWarning":case"suppressHydrationWarning":break;default:Dl(c)&&typeof d!="function"&&typeof d!="symbol"&&e.push(Dt,fe(c),dn,fe(nt(d)),Yt)}return e.push(Ot),ua(e,l,o),o}}var fm=D("</"),hm=D(">"),bm=D('<template id="'),xm=D('"></template>'),ym=D("<!--$-->"),_m=D('<!--$?--><template id="'),vm=D('"></template>'),jm=D("<!--$!-->"),wm=D("<!--/$-->"),km=D("<template"),Sm=D('"'),Cm=D(' data-dgst="');D(' data-msg="');D(' data-stck="');var Nm=D("></template>");function ur(e,t,a){if(G(e,_m),a===null)throw Error(ue(395));return G(e,a),Te(e,vm)}var Em=D('<div hidden id="'),Rm=D('">'),Mm=D("</div>"),zm=D('<svg aria-hidden="true" style="display:none" id="'),qm=D('">'),Am=D("</svg>"),Pm=D('<math aria-hidden="true" style="display:none" id="'),Im=D('">'),Lm=D("</math>"),$m=D('<table hidden id="'),Tm=D('">'),Fm=D("</table>"),Dm=D('<table hidden><tbody id="'),Om=D('">'),Bm=D("</tbody></table>"),Gm=D('<table hidden><tr id="'),Hm=D('">'),Wm=D("</tr></table>"),Qm=D('<table hidden><colgroup id="'),Vm=D('">'),Um=D("</colgroup></table>");function Km(e,t,a,i){switch(a.insertionMode){case 0:case 1:return G(e,Em),G(e,t.segmentPrefix),G(e,fe(i.toString(16))),Te(e,Rm);case 2:return G(e,zm),G(e,t.segmentPrefix),G(e,fe(i.toString(16))),Te(e,qm);case 3:return G(e,Pm),G(e,t.segmentPrefix),G(e,fe(i.toString(16))),Te(e,Im);case 4:return G(e,$m),G(e,t.segmentPrefix),G(e,fe(i.toString(16))),Te(e,Tm);case 5:return G(e,Dm),G(e,t.segmentPrefix),G(e,fe(i.toString(16))),Te(e,Om);case 6:return G(e,Gm),G(e,t.segmentPrefix),G(e,fe(i.toString(16))),Te(e,Hm);case 7:return G(e,Qm),G(e,t.segmentPrefix),G(e,fe(i.toString(16))),Te(e,Vm);default:throw Error(ue(397))}}function Jm(e,t){switch(t.insertionMode){case 0:case 1:return Te(e,Mm);case 2:return Te(e,Am);case 3:return Te(e,Lm);case 4:return Te(e,Fm);case 5:return Te(e,Bm);case 6:return Te(e,Wm);case 7:return Te(e,Um);default:throw Error(ue(397))}}var Ym=D('function $RS(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'),Zm=D('$RS("'),Xm=D('","'),eg=D('")<\/script>'),tg=D('function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("'),ng=D('$RC("'),ag=D('","'),ig=D('")<\/script>'),og=D('function $RX(b,c,d,e){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),b._reactRetry&&b._reactRetry())};$RX("'),rg=D('$RX("'),lg=D('"'),sg=D(")<\/script>"),li=D(","),dg=/[<\u2028\u2029]/g;function si(e){return JSON.stringify(e).replace(dg,function(t){switch(t){case"<":return"\\u003c";case"\u2028":return"\\u2028";case"\u2029":return"\\u2029";default:throw Error("escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React")}})}var Tn=Object.assign,cg=Symbol.for("react.element"),Bl=Symbol.for("react.portal"),Gl=Symbol.for("react.fragment"),Hl=Symbol.for("react.strict_mode"),Wl=Symbol.for("react.profiler"),Ql=Symbol.for("react.provider"),Vl=Symbol.for("react.context"),Ul=Symbol.for("react.forward_ref"),Kl=Symbol.for("react.suspense"),Jl=Symbol.for("react.suspense_list"),Yl=Symbol.for("react.memo"),Qi=Symbol.for("react.lazy"),ug=Symbol.for("react.scope"),pg=Symbol.for("react.debug_trace_mode"),mg=Symbol.for("react.legacy_hidden"),gg=Symbol.for("react.default_value"),pr=Symbol.iterator;function wi(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case Gl:return"Fragment";case Bl:return"Portal";case Wl:return"Profiler";case Hl:return"StrictMode";case Kl:return"Suspense";case Jl:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case Vl:return(e.displayName||"Context")+".Consumer";case Ql:return(e._context.displayName||"Context")+".Provider";case Ul:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Yl:return t=e.displayName||null,t!==null?t:wi(e.type)||"Memo";case Qi:t=e._payload,e=e._init;try{return wi(e(t))}catch{}}return null}var Zl={};function mr(e,t){if(e=e.contextTypes,!e)return Zl;var a={},i;for(i in e)a[i]=t[i];return a}var en=null;function $a(e,t){if(e!==t){e.context._currentValue=e.parentValue,e=e.parent;var a=t.parent;if(e===null){if(a!==null)throw Error(ue(401))}else{if(a===null)throw Error(ue(401));$a(e,a)}t.context._currentValue=t.value}}function Xl(e){e.context._currentValue=e.parentValue,e=e.parent,e!==null&&Xl(e)}function es(e){var t=e.parent;t!==null&&es(t),e.context._currentValue=e.value}function ts(e,t){if(e.context._currentValue=e.parentValue,e=e.parent,e===null)throw Error(ue(402));e.depth===t.depth?$a(e,t):ts(e,t)}function ns(e,t){var a=t.parent;if(a===null)throw Error(ue(402));e.depth===a.depth?$a(e,a):ns(e,a),t.context._currentValue=t.value}function Ca(e){var t=en;t!==e&&(t===null?es(e):e===null?Xl(t):t.depth===e.depth?$a(t,e):t.depth>e.depth?ts(t,e):ns(t,e),en=e)}var gr={isMounted:function(){return!1},enqueueSetState:function(e,t){e=e._reactInternals,e.queue!==null&&e.queue.push(t)},enqueueReplaceState:function(e,t){e=e._reactInternals,e.replace=!0,e.queue=[t]},enqueueForceUpdate:function(){}};function fr(e,t,a,i){var r=e.state!==void 0?e.state:null;e.updater=gr,e.props=a,e.state=r;var o={queue:[],replace:!1};e._reactInternals=o;var l=t.contextType;if(e.context=typeof l=="object"&&l!==null?l._currentValue:i,l=t.getDerivedStateFromProps,typeof l=="function"&&(l=l(a,r),r=l==null?r:Tn({},r,l),e.state=r),typeof t.getDerivedStateFromProps!="function"&&typeof e.getSnapshotBeforeUpdate!="function"&&(typeof e.UNSAFE_componentWillMount=="function"||typeof e.componentWillMount=="function"))if(t=e.state,typeof e.componentWillMount=="function"&&e.componentWillMount(),typeof e.UNSAFE_componentWillMount=="function"&&e.UNSAFE_componentWillMount(),t!==e.state&&gr.enqueueReplaceState(e,e.state,null),o.queue!==null&&0<o.queue.length)if(t=o.queue,l=o.replace,o.queue=null,o.replace=!1,l&&t.length===1)e.state=t[0];else{for(o=l?t[0]:e.state,r=!0,l=l?1:0;l<t.length;l++){var d=t[l];d=typeof d=="function"?d.call(e,o,a,i):d,d!=null&&(r?(r=!1,o=Tn({},o,d)):Tn(o,d))}e.state=o}else o.queue=null}var fg={id:1,overflow:""};function ki(e,t,a){var i=e.id;e=e.overflow;var r=32-pa(i)-1;i&=~(1<<r),a+=1;var o=32-pa(t)+r;if(30<o){var l=r-r%5;return o=(i&(1<<l)-1).toString(32),i>>=l,r-=l,{id:1<<32-pa(t)+r|a<<r|i,overflow:o+e}}return{id:1<<o|a<<r|i,overflow:e}}var pa=Math.clz32?Math.clz32:xg,hg=Math.log,bg=Math.LN2;function xg(e){return e>>>=0,e===0?32:31-(hg(e)/bg|0)|0}function yg(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var _g=typeof Object.is=="function"?Object.is:yg,$t=null,Vi=null,ma=null,Le=null,qn=!1,Na=!1,Bn=0,Ht=null,Ta=0;function Zt(){if($t===null)throw Error(ue(321));return $t}function hr(){if(0<Ta)throw Error(ue(312));return{memoizedState:null,queue:null,next:null}}function Ui(){return Le===null?ma===null?(qn=!1,ma=Le=hr()):(qn=!0,Le=ma):Le.next===null?(qn=!1,Le=Le.next=hr()):(qn=!0,Le=Le.next),Le}function Ki(){Vi=$t=null,Na=!1,ma=null,Ta=0,Le=Ht=null}function as(e,t){return typeof t=="function"?t(e):t}function br(e,t,a){if($t=Zt(),Le=Ui(),qn){var i=Le.queue;if(t=i.dispatch,Ht!==null&&(a=Ht.get(i),a!==void 0)){Ht.delete(i),i=Le.memoizedState;do i=e(i,a.action),a=a.next;while(a!==null);return Le.memoizedState=i,[i,t]}return[Le.memoizedState,t]}return e=e===as?typeof t=="function"?t():t:a!==void 0?a(t):t,Le.memoizedState=e,e=Le.queue={last:null,dispatch:null},e=e.dispatch=vg.bind(null,$t,e),[Le.memoizedState,e]}function xr(e,t){if($t=Zt(),Le=Ui(),t=t===void 0?null:t,Le!==null){var a=Le.memoizedState;if(a!==null&&t!==null){var i=a[1];e:if(i===null)i=!1;else{for(var r=0;r<i.length&&r<t.length;r++)if(!_g(t[r],i[r])){i=!1;break e}i=!0}if(i)return a[0]}}return e=e(),Le.memoizedState=[e,t],e}function vg(e,t,a){if(25<=Ta)throw Error(ue(301));if(e===$t)if(Na=!0,e={action:a,next:null},Ht===null&&(Ht=new Map),a=Ht.get(t),a===void 0)Ht.set(t,e);else{for(t=a;t.next!==null;)t=t.next;t.next=e}}function jg(){throw Error(ue(394))}function ta(){}var yr={readContext:function(e){return e._currentValue},useContext:function(e){return Zt(),e._currentValue},useMemo:xr,useReducer:br,useRef:function(e){$t=Zt(),Le=Ui();var t=Le.memoizedState;return t===null?(e={current:e},Le.memoizedState=e):t},useState:function(e){return br(as,e)},useInsertionEffect:ta,useLayoutEffect:function(){},useCallback:function(e,t){return xr(function(){return e},t)},useImperativeHandle:ta,useEffect:ta,useDebugValue:ta,useDeferredValue:function(e){return Zt(),e},useTransition:function(){return Zt(),[!1,jg]},useId:function(){var e=Vi.treeContext,t=e.overflow;e=e.id,e=(e&~(1<<32-pa(e)-1)).toString(32)+t;var a=ga;if(a===null)throw Error(ue(404));return t=Bn++,e=":"+a.idPrefix+"R"+e,0<t&&(e+="H"+t.toString(32)),e+":"},useMutableSource:function(e,t){return Zt(),t(e._source)},useSyncExternalStore:function(e,t,a){if(a===void 0)throw Error(ue(407));return a()}},ga=null,di=$l.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;function wg(e){return console.error(e),null}function An(){}function kg(e,t,a,i,r,o,l,d,s){var c=[],u=new Set;return t={destination:null,responseState:t,progressiveChunkSize:i===void 0?12800:i,status:0,fatalError:null,nextSegmentId:0,allPendingTasks:0,pendingRootTasks:0,completedRootSegment:null,abortableTasks:u,pingedTasks:c,clientRenderedBoundaries:[],completedBoundaries:[],partialBoundaries:[],onError:r===void 0?wg:r,onAllReady:o===void 0?An:o,onShellReady:l===void 0?An:l,onShellError:d===void 0?An:d,onFatalError:s===void 0?An:s},a=Ea(t,0,null,a,!1,!1),a.parentFlushed=!0,e=Ji(t,e,null,a,u,Zl,null,fg),c.push(e),t}function Ji(e,t,a,i,r,o,l,d){e.allPendingTasks++,a===null?e.pendingRootTasks++:a.pendingTasks++;var s={node:t,ping:function(){var c=e.pingedTasks;c.push(s),c.length===1&&rs(e)},blockedBoundary:a,blockedSegment:i,abortSet:r,legacyContext:o,context:l,treeContext:d};return r.add(s),s}function Ea(e,t,a,i,r,o){return{status:0,id:-1,index:t,parentFlushed:!1,chunks:[],children:[],formatContext:i,boundary:a,lastPushedText:r,textEmbedded:o}}function Gn(e,t){if(e=e.onError(t),e!=null&&typeof e!="string")throw Error('onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "'+typeof e+'" instead');return e}function Ra(e,t){var a=e.onShellError;a(t),a=e.onFatalError,a(t),e.destination!==null?(e.status=2,Fl(e.destination,t)):(e.status=1,e.fatalError=t)}function _r(e,t,a,i,r){for($t={},Vi=t,Bn=0,e=a(i,r);Na;)Na=!1,Bn=0,Ta+=1,Le=null,e=a(i,r);return Ki(),e}function vr(e,t,a,i){var r=a.render(),o=i.childContextTypes;if(o!=null){var l=t.legacyContext;if(typeof a.getChildContext!="function")i=l;else{a=a.getChildContext();for(var d in a)if(!(d in o))throw Error(ue(108,wi(i)||"Unknown",d));i=Tn({},l,a)}t.legacyContext=i,kt(e,t,r),t.legacyContext=l}else kt(e,t,r)}function jr(e,t){if(e&&e.defaultProps){t=Tn({},t),e=e.defaultProps;for(var a in e)t[a]===void 0&&(t[a]=e[a]);return t}return t}function Si(e,t,a,i,r){if(typeof a=="function")if(a.prototype&&a.prototype.isReactComponent){r=mr(a,t.legacyContext);var o=a.contextType;o=new a(i,typeof o=="object"&&o!==null?o._currentValue:r),fr(o,a,i,r),vr(e,t,o,a)}else{o=mr(a,t.legacyContext),r=_r(e,t,a,i,o);var l=Bn!==0;if(typeof r=="object"&&r!==null&&typeof r.render=="function"&&r.$$typeof===void 0)fr(r,a,i,o),vr(e,t,r,a);else if(l){i=t.treeContext,t.treeContext=ki(i,1,0);try{kt(e,t,r)}finally{t.treeContext=i}}else kt(e,t,r)}else if(typeof a=="string"){switch(r=t.blockedSegment,o=gm(r.chunks,a,i,e.responseState,r.formatContext),r.lastPushedText=!1,l=r.formatContext,r.formatContext=sm(l,a,i),Ci(e,t,o),r.formatContext=l,a){case"area":case"base":case"br":case"col":case"embed":case"hr":case"img":case"input":case"keygen":case"link":case"meta":case"param":case"source":case"track":case"wbr":break;default:r.chunks.push(fm,fe(a),hm)}r.lastPushedText=!1}else{switch(a){case mg:case pg:case Hl:case Wl:case Gl:kt(e,t,i.children);return;case Jl:kt(e,t,i.children);return;case ug:throw Error(ue(343));case Kl:e:{a=t.blockedBoundary,r=t.blockedSegment,o=i.fallback,i=i.children,l=new Set;var d={id:null,rootSegmentID:-1,parentFlushed:!1,pendingTasks:0,forceClientRender:!1,completedSegments:[],byteSize:0,fallbackAbortableTasks:l,errorDigest:null},s=Ea(e,r.chunks.length,d,r.formatContext,!1,!1);r.children.push(s),r.lastPushedText=!1;var c=Ea(e,0,null,r.formatContext,!1,!1);c.parentFlushed=!0,t.blockedBoundary=d,t.blockedSegment=c;try{if(Ci(e,t,i),c.lastPushedText&&c.textEmbedded&&c.chunks.push(Wi),c.status=1,Ma(d,c),d.pendingTasks===0)break e}catch(u){c.status=4,d.forceClientRender=!0,d.errorDigest=Gn(e,u)}finally{t.blockedBoundary=a,t.blockedSegment=r}t=Ji(e,o,a,s,l,t.legacyContext,t.context,t.treeContext),e.pingedTasks.push(t)}return}if(typeof a=="object"&&a!==null)switch(a.$$typeof){case Ul:if(i=_r(e,t,a.render,i,r),Bn!==0){a=t.treeContext,t.treeContext=ki(a,1,0);try{kt(e,t,i)}finally{t.treeContext=a}}else kt(e,t,i);return;case Yl:a=a.type,i=jr(a,i),Si(e,t,a,i,r);return;case Ql:if(r=i.children,a=a._context,i=i.value,o=a._currentValue,a._currentValue=i,l=en,en=i={parent:l,depth:l===null?0:l.depth+1,context:a,parentValue:o,value:i},t.context=i,kt(e,t,r),e=en,e===null)throw Error(ue(403));i=e.parentValue,e.context._currentValue=i===gg?e.context._defaultValue:i,e=en=e.parent,t.context=e;return;case Vl:i=i.children,i=i(a._currentValue),kt(e,t,i);return;case Qi:r=a._init,a=r(a._payload),i=jr(a,i),Si(e,t,a,i,void 0);return}throw Error(ue(130,a==null?a:typeof a,""))}}function kt(e,t,a){if(t.node=a,typeof a=="object"&&a!==null){switch(a.$$typeof){case cg:Si(e,t,a.type,a.props,a.ref);return;case Bl:throw Error(ue(257));case Qi:var i=a._init;a=i(a._payload),kt(e,t,a);return}if(ji(a)){wr(e,t,a);return}if(a===null||typeof a!="object"?i=null:(i=pr&&a[pr]||a["@@iterator"],i=typeof i=="function"?i:null),i&&(i=i.call(a))){if(a=i.next(),!a.done){var r=[];do r.push(a.value),a=i.next();while(!a.done);wr(e,t,r)}return}throw e=Object.prototype.toString.call(a),Error(ue(31,e==="[object Object]"?"object with keys {"+Object.keys(a).join(", ")+"}":e))}typeof a=="string"?(i=t.blockedSegment,i.lastPushedText=or(t.blockedSegment.chunks,a,e.responseState,i.lastPushedText)):typeof a=="number"&&(i=t.blockedSegment,i.lastPushedText=or(t.blockedSegment.chunks,""+a,e.responseState,i.lastPushedText))}function wr(e,t,a){for(var i=a.length,r=0;r<i;r++){var o=t.treeContext;t.treeContext=ki(o,i,r);try{Ci(e,t,a[r])}finally{t.treeContext=o}}}function Ci(e,t,a){var i=t.blockedSegment.formatContext,r=t.legacyContext,o=t.context;try{return kt(e,t,a)}catch(s){if(Ki(),typeof s=="object"&&s!==null&&typeof s.then=="function"){a=s;var l=t.blockedSegment,d=Ea(e,l.chunks.length,null,l.formatContext,l.lastPushedText,!0);l.children.push(d),l.lastPushedText=!1,e=Ji(e,t.node,t.blockedBoundary,d,t.abortSet,t.legacyContext,t.context,t.treeContext).ping,a.then(e,e),t.blockedSegment.formatContext=i,t.legacyContext=r,t.context=o,Ca(o)}else throw t.blockedSegment.formatContext=i,t.legacyContext=r,t.context=o,Ca(o),s}}function Sg(e){var t=e.blockedBoundary;e=e.blockedSegment,e.status=3,os(this,t,e)}function is(e,t,a){var i=e.blockedBoundary;e.blockedSegment.status=3,i===null?(t.allPendingTasks--,t.status!==2&&(t.status=2,t.destination!==null&&t.destination.close())):(i.pendingTasks--,i.forceClientRender||(i.forceClientRender=!0,e=a===void 0?Error(ue(432)):a,i.errorDigest=t.onError(e),i.parentFlushed&&t.clientRenderedBoundaries.push(i)),i.fallbackAbortableTasks.forEach(function(r){return is(r,t,a)}),i.fallbackAbortableTasks.clear(),t.allPendingTasks--,t.allPendingTasks===0&&(i=t.onAllReady,i()))}function Ma(e,t){if(t.chunks.length===0&&t.children.length===1&&t.children[0].boundary===null){var a=t.children[0];a.id=t.id,a.parentFlushed=!0,a.status===1&&Ma(e,a)}else e.completedSegments.push(t)}function os(e,t,a){if(t===null){if(a.parentFlushed){if(e.completedRootSegment!==null)throw Error(ue(389));e.completedRootSegment=a}e.pendingRootTasks--,e.pendingRootTasks===0&&(e.onShellError=An,t=e.onShellReady,t())}else t.pendingTasks--,t.forceClientRender||(t.pendingTasks===0?(a.parentFlushed&&a.status===1&&Ma(t,a),t.parentFlushed&&e.completedBoundaries.push(t),t.fallbackAbortableTasks.forEach(Sg,e),t.fallbackAbortableTasks.clear()):a.parentFlushed&&a.status===1&&(Ma(t,a),t.completedSegments.length===1&&t.parentFlushed&&e.partialBoundaries.push(t)));e.allPendingTasks--,e.allPendingTasks===0&&(e=e.onAllReady,e())}function rs(e){if(e.status!==2){var t=en,a=di.current;di.current=yr;var i=ga;ga=e.responseState;try{var r=e.pingedTasks,o;for(o=0;o<r.length;o++){var l=r[o],d=e,s=l.blockedSegment;if(s.status===0){Ca(l.context);try{kt(d,l,l.node),s.lastPushedText&&s.textEmbedded&&s.chunks.push(Wi),l.abortSet.delete(l),s.status=1,os(d,l.blockedBoundary,s)}catch(b){if(Ki(),typeof b=="object"&&b!==null&&typeof b.then=="function"){var c=l.ping;b.then(c,c)}else{l.abortSet.delete(l),s.status=4;var u=l.blockedBoundary,p=b,m=Gn(d,p);if(u===null?Ra(d,p):(u.pendingTasks--,u.forceClientRender||(u.forceClientRender=!0,u.errorDigest=m,u.parentFlushed&&d.clientRenderedBoundaries.push(u))),d.allPendingTasks--,d.allPendingTasks===0){var y=d.onAllReady;y()}}}finally{}}}r.splice(0,o),e.destination!==null&&Yi(e,e.destination)}catch(b){Gn(e,b),Ra(e,b)}finally{ga=i,di.current=a,a===yr&&Ca(t)}}}function na(e,t,a){switch(a.parentFlushed=!0,a.status){case 0:var i=a.id=e.nextSegmentId++;return a.lastPushedText=!1,a.textEmbedded=!1,e=e.responseState,G(t,bm),G(t,e.placeholderPrefix),e=fe(i.toString(16)),G(t,e),Te(t,xm);case 1:a.status=2;var r=!0;i=a.chunks;var o=0;a=a.children;for(var l=0;l<a.length;l++){for(r=a[l];o<r.index;o++)G(t,i[o]);r=Fa(e,t,r)}for(;o<i.length-1;o++)G(t,i[o]);return o<i.length&&(r=Te(t,i[o])),r;default:throw Error(ue(390))}}function Fa(e,t,a){var i=a.boundary;if(i===null)return na(e,t,a);if(i.parentFlushed=!0,i.forceClientRender)i=i.errorDigest,Te(t,jm),G(t,km),i&&(G(t,Cm),G(t,fe(nt(i))),G(t,Sm)),Te(t,Nm),na(e,t,a);else if(0<i.pendingTasks){i.rootSegmentID=e.nextSegmentId++,0<i.completedSegments.length&&e.partialBoundaries.push(i);var r=e.responseState,o=r.nextSuspenseID++;r=D(r.boundaryPrefix+o.toString(16)),i=i.id=r,ur(t,e.responseState,i),na(e,t,a)}else if(i.byteSize>e.progressiveChunkSize)i.rootSegmentID=e.nextSegmentId++,e.completedBoundaries.push(i),ur(t,e.responseState,i.id),na(e,t,a);else{if(Te(t,ym),a=i.completedSegments,a.length!==1)throw Error(ue(391));Fa(e,t,a[0])}return Te(t,wm)}function kr(e,t,a){return Km(t,e.responseState,a.formatContext,a.id),Fa(e,t,a),Jm(t,a.formatContext)}function Sr(e,t,a){for(var i=a.completedSegments,r=0;r<i.length;r++)ls(e,t,a,i[r]);if(i.length=0,e=e.responseState,i=a.id,a=a.rootSegmentID,G(t,e.startInlineScript),e.sentCompleteBoundaryFunction?G(t,ng):(e.sentCompleteBoundaryFunction=!0,G(t,tg)),i===null)throw Error(ue(395));return a=fe(a.toString(16)),G(t,i),G(t,ag),G(t,e.segmentPrefix),G(t,a),Te(t,ig)}function ls(e,t,a,i){if(i.status===2)return!0;var r=i.id;if(r===-1){if((i.id=a.rootSegmentID)===-1)throw Error(ue(392));return kr(e,t,i)}return kr(e,t,i),e=e.responseState,G(t,e.startInlineScript),e.sentCompleteSegmentFunction?G(t,Zm):(e.sentCompleteSegmentFunction=!0,G(t,Ym)),G(t,e.segmentPrefix),r=fe(r.toString(16)),G(t,r),G(t,Xm),G(t,e.placeholderPrefix),G(t,r),Te(t,eg)}function Yi(e,t){jt=new Uint8Array(512),wt=0;try{var a=e.completedRootSegment;if(a!==null&&e.pendingRootTasks===0){Fa(e,t,a),e.completedRootSegment=null;var i=e.responseState.bootstrapChunks;for(a=0;a<i.length-1;a++)G(t,i[a]);a<i.length&&Te(t,i[a])}var r=e.clientRenderedBoundaries,o;for(o=0;o<r.length;o++){var l=r[o];i=t;var d=e.responseState,s=l.id,c=l.errorDigest,u=l.errorMessage,p=l.errorComponentStack;if(G(i,d.startInlineScript),d.sentClientRenderFunction?G(i,rg):(d.sentClientRenderFunction=!0,G(i,og)),s===null)throw Error(ue(395));G(i,s),G(i,lg),(c||u||p)&&(G(i,li),G(i,fe(si(c||"")))),(u||p)&&(G(i,li),G(i,fe(si(u||"")))),p&&(G(i,li),G(i,fe(si(p)))),Te(i,sg)}r.splice(0,o);var m=e.completedBoundaries;for(o=0;o<m.length;o++)Sr(e,t,m[o]);m.splice(0,o),tr(t),jt=new Uint8Array(512),wt=0;var y=e.partialBoundaries;for(o=0;o<y.length;o++){var b=y[o];e:{r=e,l=t;var w=b.completedSegments;for(d=0;d<w.length;d++)if(!ls(r,l,b,w[d])){d++,w.splice(0,d);var f=!1;break e}w.splice(0,d),f=!0}if(!f){e.destination=null,o++,y.splice(0,o);return}}y.splice(0,o);var v=e.completedBoundaries;for(o=0;o<v.length;o++)Sr(e,t,v[o]);v.splice(0,o)}finally{tr(t),e.allPendingTasks===0&&e.pingedTasks.length===0&&e.clientRenderedBoundaries.length===0&&e.completedBoundaries.length===0&&t.close()}}function Cr(e,t){try{var a=e.abortableTasks;a.forEach(function(i){return is(i,e,t)}),a.clear(),e.destination!==null&&Yi(e,e.destination)}catch(i){Gn(e,i),Ra(e,i)}}Bi.renderToReadableStream=function(e,t){return new Promise(function(a,i){var r,o,l=new Promise(function(u,p){o=u,r=p}),d=kg(e,rm(t?t.identifierPrefix:void 0,t?t.nonce:void 0,t?t.bootstrapScriptContent:void 0,t?t.bootstrapScripts:void 0,t?t.bootstrapModules:void 0),lm(t?t.namespaceURI:void 0),t?t.progressiveChunkSize:void 0,t?t.onError:void 0,o,function(){var u=new ReadableStream({type:"bytes",pull:function(p){if(d.status===1)d.status=2,Fl(p,d.fatalError);else if(d.status!==2&&d.destination===null){d.destination=p;try{Yi(d,p)}catch(m){Gn(d,m),Ra(d,m)}}},cancel:function(){Cr(d)}},{highWaterMark:0});u.allReady=l,a(u)},function(u){l.catch(function(){}),i(u)},r);if(t&&t.signal){var s=t.signal,c=function(){Cr(d,s.reason),s.removeEventListener("abort",c)};s.addEventListener("abort",c)}rs(d)})};Bi.version="18.3.1";var mn,ss;mn=pn,ss=Bi;mn.version;var Cg=mn.renderToString;mn.renderToStaticMarkup;mn.renderToNodeStream;mn.renderToStaticNodeStream;ss.renderToReadableStream;function Ng(e){return e.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)}function Eg(e){const t=e.id;if(typeof t=="number")return Number.isFinite(t)&&t>=0;if(typeof t=="string"){const a=t.trim();return a?!/^temp[-_:]|^new[-_:]|^draft[-_:]/i.test(a):!1}return!1}function Rg(e){const t=String(e.type??"").trim().toLowerCase(),a=String(e.physical_node_kind??"").trim().toLowerCase(),i=typeof e.qr_payload=="string"?e.qr_payload.trim():"";let r=null;if(typeof e.physical_qr=="string")try{r=JSON.parse(e.physical_qr)}catch{}else typeof e.physical_qr=="object"&&e.physical_qr!==null&&(r=e.physical_qr);if(!(t==="qr_scan"||a==="qr"||!!i||!!(r!=null&&r.payload))||!Eg(e))return null;const l=(i||null)??(r==null?void 0:r.payload)??null,d=String(e.title??"").trim(),s=typeof l=="string"?l.trim():"";return!d&&!s?null:s?{label:d||"Nodo QR",payload:s}:{label:d,payload:Ng(d)||"objeto_saga"}}function Mg(e){const t=e.map(Rg).filter(Boolean);if(t.length===0){alert("No hay nodos QR físicos configurados en esta misión.");return}const i=`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Pegatinas QR - SAGA Engine</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 0;
          background: #f8fafc;
          color: #0f172a;
        }

        /* Fixed Toolbar for interactive UI before printing */
        .toolbar {
          position: sticky;
          top: 0;
          background: #0f172a;
          color: #f8fafc;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9999;
        }
        .toolbar-title {
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .toolbar-label {
          font-size: 13px;
          color: #94a3b8;
        }
        .btn-copies {
          background: #1e293b;
          color: #cbd5e1;
          border: 1px solid #334155;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-copies.active {
          background: #38bdf8;
          color: #0f172a;
          border-color: #38bdf8;
        }
        .btn-print {
          background: #22c55e;
          color: #ffffff;
          border: none;
          padding: 8px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 8px rgba(34,197,94,0.3);
        }
        .btn-print:hover {
          background: #16a34a;
        }

        /* Printable Stickers Grid */
        .page-container {
          padding: 24px;
        }
        .aviso {
          max-width: 560px;
          margin: 0 auto 20px;
          padding: 12px 16px;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-left: 3px solid #059669;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.5;
          color: #064e3b;
        }
        .aviso b { display: block; margin-bottom: 4px; }
        .sticker-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          justify-content: center;
        }
        .sticker-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          page-break-inside: avoid;
          break-inside: avoid;
          /* Marca de corte: por donde pasar la tijera sin comerse la zona de
             silencio del codigo, que es justo lo que lo hace legible. */
          padding: 3mm;
          outline: 1px dashed #94a3b8;
          outline-offset: -1px;
        }

        /* Print Override */
        @media print {
          /* Tamano real, no "lo que quepa". Un QR reescalado por la impresora
             deja de tener el tamano de modulo que se calculo para leerse a un
             brazo de distancia. */
          @page { margin: 8mm; }
          body {
            background: #ffffff;
            color: #000000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .toolbar, .aviso {
            display: none !important;
          }
          .page-container {
            padding: 0;
          }
          .sticker-grid {
            gap: 0;
            justify-content: flex-start;
          }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <div class="toolbar-title">
          <span>🖨️ Imprimir Pegatinas QR</span>
        </div>
        <div class="toolbar-controls">
          <span class="toolbar-label">Copias por pegatina:</span>
          <button class="btn-copies active" onclick="renderGrid(1)">1x</button>
          <button class="btn-copies" onclick="renderGrid(2)">2x</button>
          <button class="btn-copies" onclick="renderGrid(4)">4x</button>
          <button class="btn-copies" onclick="renderGrid(6)">6x</button>
          <button class="btn-copies" onclick="renderGrid(8)">8x</button>
          <button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR</button>
        </div>
      </div>

      <div class="page-container">
        <div class="aviso">
          <b>Imprime a tamaño real (100 %), sin «ajustar a la página».</b>
          El código mide 38 mm de lado a propósito: es lo que hace que se lea a un
          brazo de distancia y con luz mala. Si la impresora lo encoge, deja de
          leerse. La línea de puntos es por donde cortar sin comerse el margen
          blanco del código, que es parte del código.
        </div>
        <div class="sticker-grid" id="grid"></div>
      </div>

      <script>
        const cardsData = ${JSON.stringify(t.map(o=>({label:o.label,payload:o.payload,qrSvg:Cg(n.jsx(el,{data:o,paraImprimir:!0}))})))};

        function renderGrid(multiplier) {
          const grid = document.getElementById('grid');
          let htmlStr = '';

          cardsData.forEach(c => {
            for (let i = 0; i < multiplier; i++) {
              htmlStr += \`
                <div class="sticker-card">
                  <div class="qr-wrap">\${c.qrSvg}</div>
                </div>
              \`;
            }
          });

          grid.innerHTML = htmlStr;

          document.querySelectorAll('.btn-copies').forEach(btn => {
            btn.classList.toggle('active', btn.innerText === multiplier + 'x');
          });
        }

        window.onload = () => {
          renderGrid(1);
        };
      <\/script>
    </body>
    </html>
  `,r=window.open("","_blank");r?(r.document.write(i),r.document.close()):alert("Permite las ventanas emergentes (pop-ups) para imprimir los QRs.")}function En(e){return e?String(e.id??e.index):""}function zg(e,t){return e?!!e[t]:!1}function qg({title:e,subtitle:t,profiles:a,stages:i,familyCounts:r,selectedStage:o,cmsPanel:l,localNotice:d,saveState:s,saveError:c,playerDrafts:u,playerSaveState:p,playerSaveError:m,profileProgress:y,profileActionState:b,profileActionError:w,missionDraft:f,settingsSaveState:v,settingsSaveError:N,onRefresh:h,onSelectStage:C,onCreateNode:z,onCreateNodeAt:B,onInsertNodeAt:U,onMoveStage:ee,onSetLegVia:_e,onSetLegTrack:pe,onApplyStage:ke,onDeleteStage:je,onReorderStage:mt,onSaveStages:Fe,onSetCmsPanel:K,onUpdatePlayer:we,onDeletePlayer:qe,onAddPlayer:He,onSavePlayers:Ue,onProfileAction:de,onUpdateMissionDraft:De,onSaveSettings:Se,onApplyMissionTemplate:Xe,onCreateNodesWithItems:Oe}){var Qt,Vt;const{t:te}=ul(),[lt,Ye]=S.useState(null),[Ke,tt]=S.useState(!1),[gt,Et]=S.useState(!1),[me,g]=S.useState(!1),[x,A]=S.useState(null),[T,Z]=S.useState(!1),[ce,Ce]=S.useState(!1),[Ne,Be]=S.useState(null);S.useEffect(()=>{const M=ae=>{s==="dirty"&&(ae.preventDefault(),ae.returnValue="")};return window.addEventListener("beforeunload",M),()=>window.removeEventListener("beforeunload",M)},[s]);const $e=()=>{s==="dirty"?Ce(!0):h()},[P,W]=S.useState(null),[oe,ge]=S.useState([]),[le,We]=S.useState(0),H=o?i.find(M=>En(M)===En(o))||i.find(M=>M.index===o.index)||o:null;H&&i.findIndex(M=>M.index===H.index);const Re=En(H),be=!!(H&&(zg(H,"_type_choice_done")||H.physical_node_kind||H.game_type||(Qt=H.config)!=null&&Qt.reward_item_id)),se=!!(H&&(lt===Re||typeof H.id=="string"&&H.id.startsWith("local-")&&!be));S.useEffect(()=>{if(!H){Ye(null);return}typeof H.id=="string"&&H.id.startsWith("local-")&&!be&&Ye(En(H))},[Re,be]);function X(M){!Oe||!M.length||(ge(M.map(ae=>({label:ae.label,item:ae}))),We(0),Oe([M[0]]))}function Ae(){var M;if(le<oe.length-1){const ae=le+1;We(ae);const V=(M=oe[ae])==null?void 0:M.item;V&&Oe&&Oe([V])}else ge([]),We(0),C(null)}const ne=i.filter(M=>typeof M.lat=="number"&&typeof M.lon=="number").length,Me=S.useMemo(()=>{const M=[...i].filter(V=>typeof V.lat=="number"&&typeof V.lon=="number").sort((V,ie)=>V.index-ie.index);if(M.length<2)return 0;let ae=0;for(let V=0;V<M.length-1;V+=1){const ie=Q.latLng(M[V].lat,M[V].lon),xe=Q.latLng(M[V+1].lat,M[V+1].lon);ae+=ie.distanceTo(xe)}return ae/1e3},[i]),[ye,ze]=S.useState({distanceKm:0,trailKm:0,elevationM:0,durationMin:0,mappedCount:0,routeCoords:[]}),[_,k]=S.useState([]),[j,q]=S.useState(0),$=i.length,F=S.useMemo(()=>{const M=[...i].sort((V,ie)=>V.index-ie.index);if(M.length<2)return null;let ae=0;for(let V=1;V<M.length;V++){const ie=M[V].route_track;if(!Array.isArray(ie)||ie.length<2)return null;for(let xe=0;xe<ie.length-1;xe++){const st=ie[xe],Pe=ie[xe+1];if(!Array.isArray(st)||!Array.isArray(Pe))return null;ae+=Q.latLng(st[0],st[1]).distanceTo(Q.latLng(Pe[0],Pe[1]))/1e3}}return ae>0?ae:null},[i]),R=F!==null?F:Number.isFinite(ye.trailKm)&&ye.trailKm>0?ye.trailKm:Number.isFinite(ye.distanceKm)&&ye.distanceKm>0?ye.distanceKm:null,E=R??Me??0,O=F!==null||R!==null&&ye.measured===!0,L=Number.isFinite(ye.durationMin)&&ye.durationMin>0?ye.durationMin:Math.round(E*15),J=Number.isFinite(ye.elevationM)&&ye.elevationM>0?ye.elevationM:null,Y=M=>{ze(ae=>{const V={...ae,...M};return V.routeCoords&&V.routeCoords.length>0&&k(V.routeCoords),V})};function Qe(M,ae,V){const ie=URL.createObjectURL(new Blob([M],{type:V})),xe=document.createElement("a");xe.href=ie,xe.download=ae,document.body.appendChild(xe),xe.click(),document.body.removeChild(xe),URL.revokeObjectURL(ie)}function Ee(){const M=new Date,ae=V=>String(V).padStart(2,"0");return`${M.getFullYear()}${ae(M.getMonth()+1)}${ae(M.getDate())}-${ae(M.getHours())}${ae(M.getMinutes())}`}async function Je(){if(!me){g(!0),A(null);try{const M=await Ns();if(M.status!=="ok")throw new Error("El servidor no devolvió la copia.");Qe(JSON.stringify(M,null,2),`saga-copia-${Ee()}.json`,"application/json");const ae=Array.isArray(M.route_track)?M.route_track:_;if(ae.length>0){let V=`<?xml version="1.0" encoding="UTF-8"?>
`;V+=`<gpx version="1.1" creator="SAGA Engine" xmlns="http://www.topografix.com/GPX/1/1">
`,V+=`  <trk>
    <name>Ruta SAGA</name>
    <trkseg>
`,ae.forEach(([ie,xe])=>{V+=`      <trkpt lat="${ie}" lon="${xe}"></trkpt>
`}),V+=`    </trkseg>
  </trk>
</gpx>`,Qe(V,`saga-ruta-${Ee()}.gpx`,"application/gpx+xml")}}catch(M){A(M instanceof Error?M.message:"No se pudo exportar.")}finally{g(!1)}}}function et(M){K(l===M?"none":M)}function xt(M){const ae=typeof window<"u"?window.innerWidth:390,V=typeof window<"u"?window.innerHeight:760,ie=(M==null?void 0:M.x)??ae/2,xe=(M==null?void 0:M.y)??V/2;return{clientX:Math.min(Math.max(ie,82),Math.max(82,ae-82)),clientY:Math.min(Math.max(xe,112),Math.max(112,V-126))}}function ot(M,ae,V){const ie=xt(V);W({lat:M,lon:ae,...ie})}function Rt(){W(null)}function gn(){P&&(B(P.lat,P.lon),W(null))}function Wn(M){const ae=new Map;function V(ie,xe){if(typeof ie!="string"||!ie.trim())return;const st=Number(xe),Pe=Number.isFinite(st)&&st>0?Math.floor(st):1;ae.set(ie,(ae.get(ie)||0)+Pe)}for(const ie of M){const xe=typeof ie.config=="object"&&ie.config?ie.config:{};V(ie.physical_item_id,ie.physical_item_quantity??xe.physical_item_quantity),V(xe.reward_item_id,xe.reward_item_quantity)}for(const ie of M){const xe=String(ie.required_item_id||"").trim();if(!xe)continue;const st=ie.title||"Nodo",Pe=Math.max(1,Number(ie.required_item_quantity)||1);if((ae.get(xe)||0)>=Pe)continue;const St=ks(xe);if(!St)return`El nodo "${st}" requiere el objeto "${xe}", pero ningún nodo de la misión lo entrega y ninguna receta lo fabrica.`;const Tt=St.inputs.filter(Ct=>(ae.get(Ct.item_id)||0)<Ct.quantity).map(Ct=>{const hn=ae.get(Ct.item_id)||0;return`${Ct.item_id} (hacen falta ${Ct.quantity}, la ruta da ${hn})`});if(Tt.length>0)return`El nodo "${st}" requiere "${St.label}", pero la ruta no reparte sus ingredientes: ${Tt.join("; ")}.`}return null}function Qn(){const M=Wn(i);if(M){Be(M),setTimeout(()=>Be(null),8e3);return}Fe()}const Vn=Nr(e,"SAGA Engine"),fn=Nr(t,"Mission Control");return n.jsxs("main",{className:o?"saga-admin-shell has-node-editor":"saga-admin-shell","aria-label":"SAGA Engine admin mission control",children:[n.jsxs("aside",{className:"saga-left-rail","aria-label":"Mission navigation",children:[n.jsxs("div",{className:"saga-rail-brand",children:[n.jsx("span",{className:"saga-brand-mark",children:"⚡"}),n.jsxs("div",{children:[n.jsx("strong",{children:"SAGA Engine"}),n.jsx("small",{children:"Mission Control"})]})]}),n.jsxs("section",{className:"saga-mission-card",children:[n.jsx("span",{className:"saga-eyebrow",children:te("admin.liveMission")}),n.jsx("h1",{children:Vn}),n.jsx("p",{children:fn}),n.jsxs("div",{className:"saga-mini-stats",children:[n.jsxs("span",{children:[n.jsx("b",{children:i.length})," ",te("admin.nodes")]}),n.jsxs("span",{children:[n.jsx("b",{children:a.length})," ",te("admin.profiles")]}),n.jsxs("span",{children:[n.jsx("b",{children:ne})," ",te("admin.mapped")]})]})]}),n.jsxs("nav",{className:"saga-rail-actions","aria-label":"Primary admin actions",children:[n.jsxs("button",{type:"button",className:"saga-primary-action saga-admin-add-node-action",onClick:z,children:["+ ",te("admin.addNode")]}),n.jsx("button",{type:"button",className:"saga-save-action","data-state":s,disabled:s==="saving",onClick:Qn,children:s==="saving"?"⏳ Guardando...":s==="dirty"?"✏️ Sin guardar":"✓ Guardado"}),n.jsx("button",{type:"button",onClick:$e,children:te("admin.refresh")})]}),Ne?n.jsxs("div",{className:"saga-save-validation-warning",children:[n.jsx("b",{children:"⚠️ Misión incompleta"}),n.jsx("p",{children:Ne})]}):null,n.jsxs("div",{className:"saga-panel-switcher",children:[n.jsx("button",{type:"button",className:l==="players"?"active":"",onClick:()=>et("players"),children:te("admin.players")}),n.jsx("button",{type:"button",className:l==="labels"?"active":"",onClick:()=>et("labels"),children:te("admin.families")}),n.jsx("button",{type:"button",className:l==="objects"?"active":"",onClick:()=>et("objects"),children:"Objetos 🎒"}),n.jsx("button",{type:"button",className:l==="mission"?"active":"",onClick:()=>et("mission"),children:te("admin.settings")})]}),n.jsxs("section",{className:"saga-route-list","aria-label":"Route nodes",children:[n.jsxs("div",{className:"saga-section-title",style:{display:"flex",justifyContent:"space-between",alignItems:"center"},children:[n.jsxs("div",{children:[n.jsx("span",{children:te("admin.route")}),n.jsx("b",{children:i.length})]}),n.jsx("button",{type:"button",className:"saga-ghost-action",style:{fontSize:11,padding:"4px 8px",background:"rgba(255,255,255,.08)",borderRadius:8,border:0,color:"#e2e8f0",cursor:"pointer"},onClick:()=>Mg(i),children:"🖨️ QRs"})]}),n.jsxs("div",{className:"saga-node-scroll",children:[i.map((M,ae)=>{const V=Aa(M),ie=typeof M.config=="object"&&M.config!==null?M.config||{}:{},xe=$r(M.type,ie),st=(o==null?void 0:o.index)===M.index;return n.jsxs("div",{className:st?"saga-node-row active":"saga-node-row",children:[n.jsxs("button",{type:"button",className:"saga-node-main",onClick:()=>C(M),children:[n.jsx("span",{className:"saga-node-index",children:ae+1}),n.jsxs("span",{className:"saga-node-copy",children:[n.jsxs("strong",{className:"saga-node-title-line",children:[V?n.jsx("span",{className:`saga-physical-node-badge saga-physical-node-badge--${V.tone}`,title:V.label,"aria-label":V.label,children:V.icon}):null,n.jsx("span",{className:"saga-node-title-text",children:M.title||te("admin.untitledNode")})]}),n.jsxs("small",{children:[V?V.label:xe.title||M.label||M.type," · ",Ag(M.lat,M.lon)]})]})]}),n.jsxs("span",{className:"saga-node-order-actions",children:[n.jsx("button",{type:"button",title:"Subir nodo",disabled:ae===0,onPointerDown:Pe=>{Pe.preventDefault(),Pe.stopPropagation(),mt(M,"up")},onClick:Pe=>{Pe.preventDefault(),Pe.stopPropagation()},children:"↑"}),n.jsx("button",{type:"button",title:"Bajar nodo",disabled:ae>=i.length-1,onPointerDown:Pe=>{Pe.preventDefault(),Pe.stopPropagation(),mt(M,"down")},onClick:Pe=>{Pe.preventDefault(),Pe.stopPropagation()},children:"↓"})]})]},`${M.index}-${M.id??M.title}`)}),i.length===0?n.jsx("div",{className:"saga-empty-mini",children:te("admin.emptyRouteHelp")}):null]})]})]}),n.jsxs("section",{className:"saga-map-workspace","aria-label":"Map workspace",children:[n.jsxs("div",{className:"saga-command-bar",children:[n.jsxs("div",{className:"saga-command-main",children:[n.jsx("button",{type:"button",className:"saga-command-primary saga-admin-add-node-action",onClick:z,children:te("admin.addNode")}),n.jsx("button",{type:"button",onClick:Fe,disabled:s==="saving",style:{backgroundColor:s==="error"?"rgba(239, 68, 68, 0.18)":s==="dirty"?"rgba(234, 179, 8, 0.15)":s==="saved"?"rgba(34, 197, 94, 0.15)":"",borderColor:s==="error"?"rgba(239, 68, 68, 0.5)":s==="dirty"?"rgba(234, 179, 8, 0.4)":s==="saved"?"rgba(34, 197, 94, 0.4)":"",color:s==="error"?"#fca5a5":s==="dirty"?"#fde047":s==="saved"?"#86efac":"",fontWeight:800,opacity:s==="saving"?.65:1,cursor:s==="saving"?"progress":"pointer"},children:s==="saving"?"⏳ Guardando...":s==="error"?"⚠️ Error, reintentar":s==="dirty"?"✏️ Sin guardar":"✓ Guardado"}),n.jsx("button",{type:"button",onClick:$e,children:te("admin.refresh")}),n.jsx("button",{type:"button",id:"admin-heatmap-toggle",className:Ke?"saga-heatmap-toggle active":"saga-heatmap-toggle",onClick:()=>tt(!Ke),title:"Ver heatmap de rastros de jugadores en el mapa",children:Ke?"🔥 Ocultar Rastros":"🔥 Ver Rastros"}),n.jsx("button",{type:"button",className:"saga-version-notes-btn",onClick:()=>Z(!0),title:"Ver novedades de las versiones 3.4.0 y 3.5.0",style:{background:"linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)",border:"1px solid rgba(56, 189, 248, 0.35)",color:"#7dd3fc",fontWeight:800,fontSize:"11px",borderRadius:10,padding:"6px 12px",cursor:"pointer"},children:"📜 Novedades"}),n.jsx("button",{type:"button",onClick:()=>Et(M=>!M),title:gt?"Modo libre: arrastra los picos del trazado uno a uno":"Modo normal: arrastra la línea y se ajusta a los caminos",style:{background:gt?"linear-gradient(135deg, rgba(245, 158, 11, 0.35) 0%, rgba(180, 83, 9, 0.35) 100%)":"linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(180, 83, 9, 0.16) 100%)",border:"1px solid rgba(251, 191, 36, 0.45)",color:"#fcd34d",fontWeight:800,fontSize:"11px",borderRadius:10,padding:"6px 12px",cursor:"pointer"},children:gt?"✏️ Modo libre":"🔗 Modo normal"}),n.jsx("button",{type:"button",onClick:()=>void Je(),disabled:me,title:x||"Descarga una copia de respaldo con nodos, juegos, historia, jugadores y trazado (+ el GPX aparte)",style:{background:"linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(21, 128, 61, 0.2) 100%)",border:"1px solid rgba(74, 222, 128, 0.35)",color:"#86efac",fontWeight:800,fontSize:"11px",borderRadius:10,padding:"6px 12px",cursor:"pointer",marginLeft:"auto"},children:me?"⏳ Exportando…":x?"⚠️ Reintentar copia":"⬇️ Copia de respaldo"})]}),n.jsx("div",{className:"saga-family-chips","aria-label":"Family counts",children:ba.map(M=>n.jsxs("span",{children:[M.icon," ",r[M.id]||0]},M.id))})]}),n.jsxs("div",{className:"saga-centered-route-hud",style:{position:"absolute",top:75,left:"50%",transform:"translateX(-50%)",zIndex:90,background:"rgba(2, 6, 23, 0.52)",backdropFilter:"blur(28px) saturate(140%)",border:"1px solid rgba(255, 255, 255, 0.15)",boxShadow:"0 18px 48px rgba(0, 0, 0, 0.24)",borderRadius:24,padding:"8px 20px",color:"#f8fafc",display:"flex",alignItems:"center",gap:14,fontSize:12,fontWeight:800,whiteSpace:"nowrap",pointerEvents:"auto"},children:[n.jsx("span",{style:{color:"#38bdf8",fontWeight:900,textTransform:"uppercase",letterSpacing:"0.06em"},children:"🟢 RUTA SENDEROS"}),n.jsxs("span",{children:["📏 Distancia: ",n.jsxs("strong",{style:{color:"#facc15",fontSize:13},children:[E.toFixed(2)," km"]}),n.jsx("span",{style:{marginLeft:5,fontSize:9,fontWeight:900,letterSpacing:"0.04em",color:O?"#4ade80":"#fbbf24"},title:O?"Distancia real por camino, calculada por el router peatonal":"Sin respuesta del router: distancia en línea recta entre nodos",children:F!==null?"GPS":O?"CAMIÑO":"RECTA"})]}),n.jsx("span",{style:{color:"rgba(255,255,255,0.2)"},children:"|"}),n.jsxs("span",{children:["⏱️ Tiempo: ",n.jsx("strong",{style:{color:"#38bdf8",fontSize:13},children:L>=60?`${Math.floor(L/60)}h ${L%60}m`:`${L} min`})]}),n.jsx("span",{style:{color:"rgba(255,255,255,0.2)"},children:"|"}),n.jsxs("span",{children:["⛰️ Desnivel: ",n.jsx("strong",{style:{color:"#4ade80",fontSize:13},children:J===null?"—":`+${J}m`})]}),n.jsx("span",{style:{color:"rgba(255,255,255,0.2)"},children:"|"}),n.jsxs("span",{children:["📍 ",n.jsxs("strong",{style:{color:"#e2e8f0",fontSize:13},children:[$," Nodos"]})]}),n.jsx("button",{type:"button",onClick:()=>q(M=>M+1),style:{marginLeft:10,background:"#38bdf8",border:"1px solid rgba(255,255,255,0.2)",borderRadius:16,padding:"4px 12px",color:"#0f172a",fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:11,boxShadow:"0 4px 12px rgba(56, 189, 248, 0.4)"},title:"Reproducir recorrido",children:"▶️ PLAY"})]}),n.jsx("div",{className:"saga-map-frame",children:n.jsx(Gs,{stages:i,selectedStage:o,onSelectStage:C,onCreateStageAt:ot,onInsertStageAt:U,onMoveStage:ee,onSetLegVia:_e,onSetLegTrack:pe,freeShape:gt,showHeatmap:Ke,onToggleHeatmap:()=>tt(!Ke),onMetricsUpdate:Y,playRouteTrigger:j})}),oe.length>0?n.jsxs("div",{className:"saga-pin-placement-banner",children:[n.jsxs("div",{className:"saga-pin-placement-info",children:[n.jsxs("span",{className:"saga-pin-badge",children:["📍 Chincheta ",le+1," de ",oe.length," (",le,"/",oe.length," confirmadas)"]}),n.jsx("strong",{style:{fontSize:"14px",color:"#f8fafc"},children:(Vt=oe[le])==null?void 0:Vt.label}),n.jsx("small",{style:{fontSize:"11px",color:"#94a3b8"},children:"Arrastra la chincheta en el mapa a su posición real"})]}),n.jsxs("button",{type:"button",className:"saga-pin-confirm-btn",onClick:Ae,children:["✅ Confirmar ubicación (",le,"/",oe.length,")"]})]}):null,T?n.jsx(sp,{onClose:()=>Z(!1)}):null,P?n.jsxs(n.Fragment,{children:[n.jsx("button",{type:"button",className:"saga-map-create-scrim","aria-label":"Descartar creación de nodo",onClick:Rt}),n.jsxs("section",{className:"saga-map-create-mini",role:"dialog","aria-modal":"true","aria-label":"Crear nodo aquí",style:{left:P.clientX,top:P.clientY},children:[n.jsx("strong",{children:"📍 ¿Crear nuevo nodo aquí?"}),n.jsxs("small",{children:["Coordenadas: ",P.lat.toFixed(5),", ",P.lon.toFixed(5)]}),n.jsxs("div",{children:[n.jsx("button",{type:"button",onClick:gn,style:{fontWeight:800},children:"➕ Crear Nodo"}),n.jsx("button",{type:"button",onClick:Rt,children:"Cancelar"})]})]})]}):null,d?n.jsx("div",{className:"saga-toast",role:"status",children:d}):null]}),H&&oe.length===0?n.jsx("aside",{className:"saga-node-editor-host is-open","aria-label":"Editor de nodo",children:se?n.jsx("div",{className:"saga-node-type-choice-screen",children:n.jsx(vu,{stage:H,chooserOnly:!0,onApplyLocal:M=>{ke({...M,_type_choice_done:!0})},onFinishChoice:()=>Ye(null),onDeleteLocal:je})}):n.jsx(Xc,{stage:H,stages:i,onClose:()=>C(null),onApplyLocal:ke,onDeleteLocal:je,onRequestChangeType:()=>Ye(En(H))})}):null,l!=="none"?n.jsxs("aside",{className:"saga-floating-panel","aria-label":"CMS panel",children:[n.jsxs("div",{className:"saga-floating-head",children:[n.jsx("strong",{children:l==="players"?te("admin.players"):l==="labels"?te("admin.families"):l==="builder"?te("admin.builder"):l==="objects"?"Objetos y Recetas":te("admin.settings")}),n.jsx("button",{type:"button",onClick:()=>K("none"),children:te("common.close")})]}),n.jsxs("div",{className:"saga-floating-body",children:[l==="builder"?n.jsx(Bu,{stages:i,onCreateNode:()=>{K("none"),z()},onApplyTemplate:Xe}):null,l==="players"?n.jsx(Du,{playerDrafts:u,playerSaveState:p,playerSaveError:m,profiles:a,stages:i,profileProgress:y,profileActionState:b,profileActionError:w,onProfileAction:de,onUpdatePlayer:we,onDeletePlayer:qe,onAddPlayer:He,onSavePlayers:Ue}):null,l==="labels"?n.jsx(Zs,{}):null,l==="objects"?n.jsx(Wu,{stages:i,onSelectStage:C,onCreateNodesWithItems:X}):null,l==="mission"?n.jsx(Ou,{missionDraft:f,settingsSaveState:v,settingsSaveError:N,onUpdateMissionDraft:De,onSaveSettings:Se}):null]})]}):null,n.jsxs("nav",{className:"saga-mobile-actions","aria-label":"Mobile actions",children:[n.jsx("button",{type:"button",onClick:Fe,children:te("common.save")}),n.jsx("button",{type:"button",onClick:()=>et("builder"),children:te("admin.builder")}),n.jsx("button",{type:"button",onClick:()=>et("players"),children:te("admin.players")}),n.jsx("button",{type:"button",onClick:()=>et("mission"),children:te("admin.settings")})]}),ce&&n.jsx("div",{className:"saga-modal-overlay",style:{zIndex:99999},children:n.jsxs("div",{className:"saga-modal",style:{maxWidth:400,padding:24,textAlign:"center"},children:[n.jsx("h3",{style:{marginTop:0,color:"#fde047"},children:"⚠️ Cambios sin guardar"}),n.jsx("p",{style:{color:"#94a3b8",fontSize:14,lineHeight:1.5,marginBottom:24},children:"Tienes nodos movidos o cambios en la misión que no han sido guardados. Si refrescas la página, se perderán."}),n.jsxs("div",{className:"saga-modal-actions",style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx("button",{type:"button",className:"saga-action-btn primary",onClick:()=>{Ce(!1),Fe()},children:"💾 Guardar cambios"}),n.jsx("button",{type:"button",className:"saga-action-btn danger",onClick:()=>{Ce(!1),h()},children:"Marcharte y continuar sin guardar"}),n.jsx("button",{type:"button",className:"saga-action-btn ghost",onClick:()=>Ce(!1),children:"Cancelar"})]})]})})]})}function Nr(e,t){const a=e.trim();return!a||/^PUT ADMIN (TITLE|SUBTITLE) HERE$/i.test(a)?t:a}function Ag(e,t){return typeof e!="number"||typeof t!="number"?"No GPS":`${e.toFixed(5)}, ${t.toFixed(5)}`}function za(e){return e==="team"?"team":"solo"}function Er(e){const t=e.id||e.display_name||"player",a=e.display_name||e.id||"Player";return{color:e.color||nn(t),avatar_url:e.avatar_url||"",avatar_initials:e.avatar_initials||tn(a)}}function Rn(e,t){const a=Array.isArray(t==null?void 0:t.player_profiles)?t.player_profiles:[],i=Array.isArray(t==null?void 0:t.players)?t.players:[],r=e.map(o=>{const l=a.find(p=>p.id===o.id),d=Array.isArray(l==null?void 0:l.members)?l.members.join(", "):"",s=o.id||o.display_name||"PLAYER",c=o.display_name||o.id||"Player",u=Er({id:s,display_name:c,color:l==null?void 0:l.color,avatar_url:l==null?void 0:l.avatar_url,avatar_initials:l==null?void 0:l.avatar_initials});return{id:s,display_name:c,mode:za(o.mode||(l==null?void 0:l.mode)),members:d,status:o.status||(l==null?void 0:l.status)||"active",...u}});return r.length>0?r:a.length>0?a.map(o=>{const l=o.id||o.display_name||"PLAYER",d=o.display_name||o.id||"Player",s=Er({id:l,display_name:d,color:o.color,avatar_url:o.avatar_url,avatar_initials:o.avatar_initials});return{id:l,display_name:d,mode:za(o.mode),members:Array.isArray(o.members)?o.members.join(", "):"",status:o.status||"active",...s}}):i.map(o=>({id:o,display_name:o,mode:"solo",members:"",status:"active",color:nn(o),avatar_url:"",avatar_initials:tn(o)}))}function Pg(e,t){const a=e.trim();return a||`PLAYER ${t+1}`}const Ig=["physical_node_kind","physical_item_kind","physical_item_id","physical_item_label","physical_qr","qr_payload"];function Zi(e,t){const a=e,i={...t};for(const r of Ig)r in a&&(i[r]=a[r]);return i}function Pn(e){if(typeof e.id=="number")return String(e.id);if(typeof e.id=="string"&&e.id.trim())return e.id.trim();const t=e.localId;return typeof t=="string"&&t.trim()?t.trim():String(e.index)}function Lg(e,t){const a=e.id;return String(typeof a=="number"||typeof a=="string"?a:t)}function Ni(e){const t=e;return t._clear_physical_fields===!0||t._physical_node_mode==="normal"||t.physical_node_kind===null||t.physical_item_kind===null}function $g(e){const t={...e};for(const a of["physical_node_kind","physical_item_kind","physical_item_id","physical_item_label","physical_qr","qr_payload"])delete t[a];return delete t._clear_physical_fields,delete t._physical_node_mode,t}function Tg(e,t){const a=t.messages||{},i=typeof(e==null?void 0:e.config)=="object"&&(e==null?void 0:e.config)!==null?e.config:{},r=typeof t.config=="object"&&t.config!==null?t.config:{},o=typeof(e==null?void 0:e.minigame)=="object"&&(e==null?void 0:e.minigame)!==null?e.minigame:{},l=typeof(e==null?void 0:e.type)=="string"?e.type:typeof o.type=="string"?o.type:"",d=t.type||"motion_challenge",c=xa(d,{...l===d?i:{},...r}),u=Ni(t)?$g(e||{}):e||{},p=Ni(t)?{}:Zi(t,{});return{...u,...p,id:typeof t.id=="number"?t.id:(e==null?void 0:e.id)??t.index,route_via:Array.isArray(t.route_via)?t.route_via:(e==null?void 0:e.route_via)??[],route_track:Array.isArray(t.route_track)?t.route_track:(e==null?void 0:e.route_track)??[],title:t.title||"Untitled node",type:d,label:Mi(d),lat:t.lat??null,lon:t.lon??null,radius:t.radius??50,content:t.content||"",intro_title:t.intro_title||"",intro_body:t.intro_body||"",entry_mode:t.entry_mode||"gps",require_proximity:!!t.require_proximity,hint:a.hint||"",gps_unavailable_message:a.gps_unavailable||"",locked_message:a.locked||"",config:c,minigame:Ir(d,c),answer:(e==null?void 0:e.answer)??"",rune:(e==null?void 0:e.rune)??""}}function Fg(e,t){const a=e.messages||{},i=e.type||"motion_challenge",r=xa(i,typeof e.config=="object"&&e.config!==null?e.config:{});return{...Ni(e)?{}:Zi(e,{}),id:typeof e.id=="number"?e.id:t,route_via:Array.isArray(e.route_via)?e.route_via:[],route_track:Array.isArray(e.route_track)?e.route_track:[],title:e.title||`NODE ${t+1}`,type:i,label:Mi(i),lat:typeof e.lat=="number"?e.lat:null,lon:typeof e.lon=="number"?e.lon:null,radius:typeof e.radius=="number"?e.radius:50,content:e.content||"",intro_title:e.intro_title||"",intro_body:e.intro_body||"",entry_mode:e.entry_mode||"gps",require_proximity:!!e.require_proximity,hint:a.hint||"",gps_unavailable_message:a.gps_unavailable||"",locked_message:a.locked||"",config:r,minigame:Ir(i,r),answer:"",rune:""}}function Dg(e){return e.map((t,a)=>Zi(t,Fg(t,a)))}function Og(e,t){const a=new Set;for(const o of e){const l=Number(o.id);Number.isFinite(l)&&a.add(l)}for(const o of t){const l=Number(o.id);Number.isFinite(l)&&a.add(l)}let i=a.size>0?Math.max(...a)+1:0;const r=new Set;return t.map((o,l)=>{const d=typeof o.id=="string"&&o.id.startsWith("local-"),s=d?i++:o.id,c=Pn(o),u=d?null:e.find((p,m)=>Lg(p,m)!==c||r.has(m)?!1:(r.add(m),!0))||null;return Tg(u,{...o,index:l,id:s})})}function fa(e){return e&&typeof e=="object"?e:{}}function Rr(e){const t=fa(e.minigame);return String(t.type||e.type||"")}function Mr(e){const t=fa(e.minigame),a=fa(t.config);return Object.keys(a).length>0?a:fa(e.config)}function Ei(e){if(Array.isArray(e))return e.map(Ei);if(e&&typeof e=="object"){const t=e;return Object.fromEntries(Object.keys(t).sort().map(a=>[a,Ei(t[a])]))}return e??null}function aa(e){return JSON.stringify(Ei(e))}function Bg(e,t){const a=[];return e.length!==t.length&&a.push(`número de nodos esperado ${e.length}, guardado ${t.length}`),e.forEach((i,r)=>{const o=t[r];if(!o){a.push(`falta el nodo ${r+1}`);return}const l=Rr(i),d=Rr(o),s=String(i.id??r),c=String(o.id??r);s!==c&&a.push(`orden/ID del nodo ${r+1}: ${s} != ${c}`),String(i.title||"")!==String(o.title||"")&&a.push(`título del nodo ${r+1}`),l!==d&&a.push(`tipo del nodo ${r+1}: ${l} != ${d}`);for(const m of["lat","lon","radius","entry_mode","require_proximity"])aa(i[m])!==aa(o[m])&&a.push(`${m} del nodo ${r+1}`);const u=xa(l,Mr(i)),p=xa(d,Mr(o));aa(u)!==aa(p)&&a.push(`configuración del nodo ${r+1}`)}),a}function ds(e){return e.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)}function Gg(e,t){const a=ds(t)||"objeto_qr",i=a;return{physical_node_kind:e,physical_item_kind:e,physical_item_id:a,physical_item_label:t,physical_qr:{kind:e,item_id:a,label:t,payload:i},qr_payload:i}}function Hg(e,t){const a=["physical_node_kind","physical_item_kind","physical_item_id","physical_item_label","physical_qr","qr_payload"],i={...t};if(i._clear_physical_fields===!0||i._physical_node_mode==="normal"||i.physical_node_kind===null||i.physical_item_kind===null){for(const o of a)delete i[o];return delete i._clear_physical_fields,delete i._physical_node_mode,i}for(const o of a)!(o in i)&&o in e&&(i[o]=e[o]);return i}function Ug(){var Me,ye,ze;const[e,t]=S.useState(null),[a,i]=S.useState("loading"),[r,o]=S.useState(null),[l,d]=S.useState(""),[s,c]=S.useState(null),[u,p]=S.useState("locked"),[m,y]=S.useState(null),[b,w]=S.useState(null),[f,v]=S.useState("none"),[N,h]=S.useState(null),[C,z]=S.useState("idle"),[B,U]=S.useState(null),[ee,_e]=S.useState("idle"),[pe,ke]=S.useState(null),[je,mt]=S.useState({}),[Fe,K]=S.useState([]),[we,qe]=S.useState("idle"),[He,Ue]=S.useState(null),[de,De]=S.useState({}),[Se,Xe]=S.useState({}),Oe=S.useRef(0);S.useEffect(()=>{let _=!1;return Ss().then(k=>{_||(t(k),i("ready"))}).catch(k=>{_||(o(k instanceof Error?k.message:"Unknown error"),i("error"))}),()=>{_=!0}},[]);const te=S.useMemo(()=>(s==null?void 0:s.profiles)||[],[s]),lt=(s==null?void 0:s.stages)||[],Ye=((Me=s==null?void 0:s.counts)==null?void 0:Me.family_counts)||{},Ke=u==="ready"&&!!s,tt=((ye=s==null?void 0:s.config)==null?void 0:ye.admin_title)||(e==null?void 0:e.admin_title)||(e==null?void 0:e.site_name)||"SAGA Admin",gt=((ze=s==null?void 0:s.config)==null?void 0:ze.admin_subtitle)||(e==null?void 0:e.admin_subtitle)||"Mission Control";S.useEffect(()=>{if(!Ke)return;const _={...e||{},...(s==null?void 0:s.config)||{}};K(Rn((s==null?void 0:s.profiles)||te||[],_)),mt(g(_))},[Ke,s,te,e]),S.useMemo(()=>{const _=s==null?void 0:s.counts,k=(s==null?void 0:s.config)||e;(_==null?void 0:_.players)??(Array.isArray(e==null?void 0:e.players)&&e.players.length),(_==null?void 0:_.profiles)??(Array.isArray(e==null?void 0:e.player_profiles)&&e.player_profiles.length),_==null||_.stages,_==null||_.finished_profiles,Array.isArray(k==null?void 0:k.map_center)&&k.map_center.join(", "),k==null||k.map_zoom},[s,e]);function Et(_){_&&Date.now()<Oe.current||w(_)}function me(_,k,j=""){const q=_[k];return typeof q=="string"||typeof q=="number"?String(q):j}function g(_){const k=Array.isArray(_.map_center)?_.map_center:e==null?void 0:e.map_center,j=Array.isArray(k)?k[0]:40.4168,q=Array.isArray(k)?k[1]:-3.7038;return{site_name:me(_,"site_name",(e==null?void 0:e.site_name)||""),admin_title:me(_,"admin_title",(e==null?void 0:e.admin_title)||""),admin_subtitle:me(_,"admin_subtitle",(e==null?void 0:e.admin_subtitle)||""),login_title:me(_,"login_title",""),login_subtitle:me(_,"login_subtitle",""),login_instructions:me(_,"login_instructions",""),story_title:me(_,"story_title",""),story_text:me(_,"story_text",""),prologue_title:me(_,"prologue_title",""),prologue_subtitle:me(_,"prologue_subtitle",""),prologue_image_url:me(_,"prologue_image_url",""),prologue_body:me(_,"prologue_body",""),player_theme:me(_,"player_theme",(e==null?void 0:e.player_theme)||"classic"),mapbox_token:me(_,"mapbox_token",(e==null?void 0:e.mapbox_token)||""),mapbox_style:me(_,"mapbox_style",(e==null?void 0:e.mapbox_style)||""),map_center_lat:String(j??40.4168),map_center_lon:String(q??-3.7038),map_zoom:me(_,"map_zoom",String((e==null?void 0:e.map_zoom)||13))}}function x(_,k){mt(j=>({...j,[_]:k})),_e("idle")}function A(){const _=e||{},k=(s==null?void 0:s.config)||{},j={..._,...k},q=Array.isArray(_.players)?_.players:Array.isArray(j.players)?j.players:[],$=Array.isArray(_.player_profiles)?_.player_profiles:Array.isArray(j.player_profiles)?j.player_profiles:[],F=Number(je.map_center_lat),R=Number(je.map_center_lon),E=Number(je.map_zoom);return{...j,players:q,player_profiles:$,site_name:je.site_name||"SAGA Engine",admin_title:je.admin_title||"Mission editor",admin_subtitle:je.admin_subtitle||"Map-first control panel",login_title:je.login_title||"",login_subtitle:je.login_subtitle||"",login_instructions:je.login_instructions||"",story_title:je.story_title||"",story_text:je.story_text||"",prologue_title:je.prologue_title||"",prologue_subtitle:je.prologue_subtitle||"",prologue_image_url:je.prologue_image_url||"",prologue_body:je.prologue_body||"",player_theme:je.player_theme||"classic",mapbox_token:je.mapbox_token||"",mapbox_style:je.mapbox_style||"",map_center:[Number.isFinite(F)?F:40.4168,Number.isFinite(R)?R:-3.7038],map_zoom:Number.isFinite(E)?E:13}}async function T(){_e("saving"),ke(null);try{const _=A(),k=await to(void 0,_);if(k.status!=="ok")throw new Error(k.message||"Could not save mission settings.");t(q=>({...q||{},..._}));const j=await ln();j.status==="ok"&&(c(j),mt(g(j.config||_)),K(Rn(j.profiles||[],_))),_e("saved"),h("Mission settings saved. Admin and player config reloaded.")}catch(_){_e("error"),ke(_ instanceof Error?_.message:"Unknown settings save error")}}function Z(_,k,j){K(q=>q.map(($,F)=>F===_?{...$,[k]:k==="mode"?za(j):j}:$)),qe("idle")}function ce(){K(_=>{const j=`PLAYER ${_.length+1}`;return[..._,{id:j,display_name:j,mode:"solo",members:"",status:"active",color:nn(j),avatar_url:"",avatar_initials:tn(j)}]}),qe("idle"),h("Jugador añadido en local. Pulsa Guardar jugadores para persistir.")}function Ce(_){K(k=>k.filter((j,q)=>q!==_)),qe("idle"),h("Jugador eliminado en local. Pulsa Guardar jugadores para persistir.")}function Ne(){const _={...e||{},...(s==null?void 0:s.config)||{}},k=Fe.map((j,q)=>{const $=Pg(j.id,q),F=j.display_name.trim()||$,R=j.members.split(",").map(E=>E.trim()).filter(Boolean);return{id:$,display_name:F,mode:za(j.mode),members:R,status:j.status.trim()||"active",color:j.color||nn($||F),avatar_url:j.avatar_url.trim(),avatar_initials:(j.avatar_initials.trim()||tn(F)).slice(0,3).toUpperCase()}});return{..._,players:k.map(j=>j.id),player_profiles:k.map(j=>({id:j.id,display_name:j.display_name,mode:j.mode,...j.mode==="team"&&j.members.length>0?{members:j.members}:{},status:j.status,color:j.color,avatar_url:j.avatar_url,avatar_initials:j.avatar_initials}))}}async function Be(_,k){const j=_.trim();if(!j){h("No se puede actuar sobre un jugador sin ID guardado.");return}const q=k==="reset_profile"||k==="mark_finished",$=k==="reset_profile"?"resetear la partida":k==="level_prev"?"retroceder 1 nodo":k==="level_next"?"avanzar 1 nodo":"marcar como finalizado";if(q&&!window.confirm(`¿Seguro que quieres ${$} para ${j}?`))return;De(E=>({...E,[j]:k})),Xe(E=>({...E,[j]:""}));const F=k==="level_next"?1:k==="level_prev"?-1:0;let R=null;F!==0&&c(E=>E&&(R=E,{...E,profiles:(E.profiles||[]).map(O=>String(O.id).trim()===j?{...O,level:Math.max(0,Number(O.level??0)+F)}:O)}));try{const E=await Ps(j,k);if(E.status!=="ok")throw new Error(E.detail||E.message||"No se pudo actualizar el progreso.");if(typeof E.level=="number"){const L=E.level;c(I=>I&&{...I,profiles:(I.profiles||[]).map(J=>String(J.id).trim()===j?{...J,level:L,finished:L>=(I.stages||[]).length}:J)})}const O=await ln();O.status==="ok"&&(c(O),K(Rn(O.profiles||[],{...e||{},...O.config||{}}))),De(L=>({...L,[j]:"saved"})),h(`${j}: ${$} aplicado. Nivel ${E.previous_level??"—"} → ${E.level??"—"}.`)}catch(E){const O=E instanceof Error?E.message:"Error desconocido.";R&&c(R),De(L=>({...L,[j]:"error"})),Xe(L=>({...L,[j]:O})),h(`${j}: sin conexión o error. Pulsa para reintentar.`)}}async function $e(){qe("saving"),Ue(null);try{const _=Ne(),k=await to(void 0,_);if(k.status!=="ok")throw new Error(k.message||"Could not save player profiles.");const j=await ln();j.status==="ok"&&(c(j),K(Rn(j.profiles||[],_))),t(q=>({...q||{},..._})),qe("saved"),h("Players saved. Admin and player config reloaded.")}catch(_){qe("error"),Ue(_ instanceof Error?_.message:"Unknown player save error")}}async function P(){const _=l.trim();if(!_&&!Ke){y("Enter the admin password to unlock Mission Control."),p("error");return}p("loading"),y(null);try{if(_){const q=await Cs(_);if(q.status!=="ok"){c(null),w(null),y(q.message||"Admin login failed."),p("error");return}d("")}const k=await ln();if(k.status!=="ok"){c(null),w(null),y(k.message||"Admin overview unavailable"),p("error");return}c(k);const j={...e||{},...Array.isArray(k.player_profiles)?{player_profiles:k.player_profiles}:{}};t(j),K(Rn(k.profiles||[],{...j,...k.config||{}})),w(null),p("ready")}catch(k){c(null),w(null),y(k instanceof Error?k.message:"Unknown error"),p("error")}}async function W(){if(!s){z("error"),U("No hay vista de administración cargada.");return}z("saving"),U(null);try{let _=[],k=!1;const j=await eo();j.status==="ok"?_=Og(j.stages||[],s.stages||[]):(k=!0,_=Dg(s.stages||[]));const q=await zs(void 0,_);if(q.status!=="ok")throw new Error(q.message||"Could not save admin stages.");const $=await eo();if($.status!=="ok")throw new Error($.message||"No se pudo verificar el guardado.");const F=Bg(_,$.stages||[]);if(F.length>0)throw new Error("El backend no guardó exactamente lo enviado: "+F.slice(0,6).join(", "));const R=await ln();R.status==="ok"&&(c(R),w(null)),z("saved"),h(k?"Guardado, verificado y recargado mediante payload de respaldo.":"Guardado y verificado contra el backend. Datos de misión recargados.")}catch(_){z("error"),U(_ instanceof Error?_.message:"Error de guardado desconocido")}}function oe(_){const k=Pn(_);c(j=>{if(!j)return j;const q=(j.stages||[]).filter(F=>Pn(F)!==k).map((F,R)=>({...F,index:R})),$=q.reduce((F,R)=>{const E=R.type||"motion_challenge";return F[E]=(F[E]||0)+1,F},{});return{...j,stages:q,counts:j.counts?{...j.counts,stages:q.length,family_counts:$}:j.counts}}),w(null),z("dirty"),h("Node removed locally. Pulsa Guardar para persistir el borrado.")}function ge(_,k){const j=Pn(_);let q=null;c($=>{if(!$)return $;const F=$.stages||[],R=F.findIndex(J=>Pn(J)===j);if(R<0)return $;const E=k==="up"?R-1:R+1;if(E<0||E>=F.length)return $;const O=[...F],[L]=O.splice(R,1);O.splice(E,0,L);const I=O.map((J,Y)=>({...J,index:Y}));return q=I[E]||null,{...$,stages:I,counts:$.counts?{...$.counts,stages:I.length}:$.counts}}),q&&(z("dirty"),h("Orden de ruta actualizado en local. Pulsa Guardar para persistir."))}function le(_,k={}){c(j=>{if(!j)return j;const q=j.stages||[],F=q.some(E=>E.index===_.index)?q.map(E=>E.index===_.index?Hg(E,_):E):[...q,_],R=F.reduce((E,O)=>{const L=O.type||"motion_challenge";return E[L]=(E[L]||0)+1,E},{});return{...j,stages:F,counts:j.counts?{...j.counts,stages:F.length,family_counts:R}:j.counts}}),k.select!==!1&&w(_),k.notice!==!1&&h(k.notice||"Vista local actualizada. Pulsa Guardar para persistir.")}function We(_){var L;if(!s)return;const k=Ys(_);if(!(lt.length===0||window.confirm(`Reemplazar la ruta local actual por la plantilla "${k.title}"? Guarda después para persistir.`)))return;const q=((L=s==null?void 0:s.config)==null?void 0:L.map_center)||(e==null?void 0:e.map_center)||[40.4168,-3.7038],$=Number(q[0]||40.4168),F=Number(q[1]||-3.7038);let R=null;const E=k.stages.map((I,J)=>{const Y=Pt(I.gameId),Qe=$+I.offsetLat,Ee=F+I.offsetLon,Je=I.physicalKind?Gg(I.physicalKind,I.itemLabel||I.title):{};if(I.physicalKind){const xt=Je;R={id:xt.physical_item_id||ds(I.itemLabel||I.title),label:xt.physical_item_label||I.itemLabel||I.title}}const et=I.requiresPreviousItem&&R?{required_item_id:R.id,required_item_label:R.label,required_item_quantity:1,required_item_consume:!1}:{};return{id:`local-template-${Date.now()}-${J}`,index:J,title:I.title,type:Y.type,label:Y.label,icon:Y.icon,lat:Qe,lon:Ee,radius:I.radius||50,entry_mode:"gps",require_proximity:!0,has_hint:!1,has_manual_fallback:!1,content:I.content||Y.content,objective:Y.objective,config:{...Y.config,...et},config_summary:Array.from(new Set([...Y.config_summary,...Object.keys(et)])),messages:Y.messages,...Je}}),O=E.reduce((I,J)=>{const Y=J.type||"motion_challenge";return I[Y]=(I[Y]||0)+1,I},{});c(I=>I&&{...I,stages:E,counts:I.counts?{...I.counts,stages:E.length,family_counts:O}:I.counts}),w(E[0]||null),v("none"),z("dirty"),h(`Plantilla "${k.title}" creada en local. Revisa los nodos y pulsa Guardar.`)}function H(_,k){var I;const j=((I=s==null?void 0:s.config)==null?void 0:I.map_center)||(e==null?void 0:e.map_center)||[40.4168,-3.7038],q=lt.filter(J=>typeof J.lat=="number"&&typeof J.lon=="number"),$=q.length>0?[q.reduce((J,Y)=>J+Number(Y.lat),0)/q.length,q.reduce((J,Y)=>J+Number(Y.lon),0)/q.length]:j,F=lt.length,R=typeof _=="number"?_:$[0],E=typeof k=="number"?k:$[1],O=Pt("shake_antenna_charge"),L={id:`local-${Date.now()}`,index:F,title:`NEW NODE ${F+1}`,type:O.type,label:O.label,lat:R,lon:E,radius:50,entry_mode:"free",require_proximity:!1,has_hint:!1,has_manual_fallback:!1,content:O.content,objective:O.objective,config:O.config,config_summary:O.config_summary,messages:O.messages};v("none"),z("dirty"),le(L),w(L),h(typeof _=="number"&&typeof k=="number"?"Nodo creado aquí. Edita el tipo y guarda cuando esté listo.":"Nodo creado en el centro de la ruta. Muévelo o edita coordenadas antes de guardar.")}function Re(_,k,j){const q=Pt("shake_antenna_charge"),$={id:`local-${Date.now()}`,index:j,title:`NEW NODE ${j+1}`,type:q.type,label:q.label,lat:_,lon:k,radius:50,entry_mode:"free",require_proximity:!1,has_hint:!1,has_manual_fallback:!1,content:q.content,objective:q.objective,config:q.config,config_summary:q.config_summary,messages:q.messages};c(F=>{if(!F)return F;const R=[...F.stages||[]];R.splice(j,0,$);const E=R.map((L,I)=>({...L,index:I})),O=E.reduce((L,I)=>{const J=I.type||"motion_challenge";return L[J]=(L[J]||0)+1,L},{});return{...F,stages:E,counts:F.counts?{...F.counts,stages:E.length,family_counts:O}:F.counts}}),v("none"),z("dirty"),h("Waypoint de ruta insertado. Guarda los cambios.")}function be(_){var F;if(!_.length)return;const k=((F=s==null?void 0:s.config)==null?void 0:F.map_center)||(e==null?void 0:e.map_center)||[40.4168,-3.7038],j=lt.filter(R=>typeof R.lat=="number"&&typeof R.lon=="number"),q=j.length>0?[j.reduce((R,E)=>R+Number(E.lat),0)/j.length,j.reduce((R,E)=>R+Number(E.lon),0)/j.length]:k,$=Pt("shake_antenna_charge");_.forEach((R,E)=>{const O=(E-(_.length-1)/2)*35e-5,L=lt.length+E,I={id:`local-${Date.now()}-${E}`,index:L,title:R.label,type:$.type,label:"Objeto Coleccionable",lat:q[0]+O,lon:q[1]+O,radius:35,entry_mode:"free",require_proximity:!1,has_hint:!1,has_manual_fallback:!1,physical_node_kind:"collectible",physical_item_id:R.id,physical_item_label:R.label,content:`Misión: Recoge ${R.label} en esta ubicación real.`,objective:`Objeto: ${R.label}`,config:{...$.config,is_map_collectible:!0,reward_item_id:R.id,reward_item_label:R.label},config_summary:[`Coleccionable: ${R.label}`],messages:$.messages};le(I,{select:!1,notice:!1})}),v("none"),w(null),z("dirty"),h(_.length===1?`📍 Chincheta colocada en el mapa para "${_[0].label}". Arrástrala a su posición final.`:`📍 Se han colocado ${_.length} chinchetas en el mapa. Arrástralas a sus posiciones finales.`)}function se(_,k,j,q={}){const $={..._,lat:k,lon:j};Oe.current=Date.now()+700,z("dirty"),le($,{select:!1,notice:!1}),q.select!==!1&&w($),h("Nodo movido en el mapa. Pulsa Guardar para persistir la nueva posición.")}function X(_,k){const j={..._,route_via:k?[k]:[]};Oe.current=Date.now()+700,z("dirty"),le(j,{select:!1,notice:!1}),h(k?"Camino moldeado. Pulsa Guardar para persistir la nueva ruta.":"Moldeado del camino eliminado. Pulsa Guardar para persistir.")}function Ae(_,k){const j={..._,route_track:k};Oe.current=Date.now()+700,z("dirty"),le(j,{select:!1,notice:!1}),h("Trazado ajustado. Pulsa Guardar para persistirlo.")}function ne(_){_.preventDefault(),P()}return Ke?n.jsxs(n.Fragment,{children:[n.jsx("style",{children:zr}),n.jsx(qg,{title:tt,subtitle:gt,profiles:te,stages:lt,familyCounts:Ye,selectedStage:b,cmsPanel:f,localNotice:N,saveState:C,saveError:B,playerDrafts:Fe,playerSaveState:we,playerSaveError:He,profileProgress:Object.fromEntries((te||[]).map(_=>[_.id,{level:_.level??0,finished:!!_.finished}])),profileActionState:de,profileActionError:Se,onProfileAction:Be,missionDraft:je,settingsSaveState:ee,settingsSaveError:pe,onRefresh:P,onSelectStage:Et,onCreateNode:()=>H(),onCreateNodeAt:H,onInsertNodeAt:Re,onMoveStage:se,onSetLegVia:X,onSetLegTrack:Ae,onApplyStage:le,onDeleteStage:oe,onReorderStage:ge,onSaveStages:W,onSetCmsPanel:v,onUpdatePlayer:Z,onDeletePlayer:Ce,onAddPlayer:ce,onSavePlayers:$e,onUpdateMissionDraft:x,onSaveSettings:T,onApplyMissionTemplate:We,onCreateNodesWithItems:be})]}):n.jsxs("div",{className:"admin-root",children:[n.jsx("style",{children:zr}),n.jsxs("section",{className:"admin-login-minimal","aria-label":"Admin login",children:[n.jsx("div",{className:"admin-login-orb admin-login-orb-a","aria-hidden":"true"}),n.jsx("div",{className:"admin-login-orb admin-login-orb-b","aria-hidden":"true"}),n.jsxs("form",{onSubmit:ne,className:"admin-login-card admin-login-card-minimal",children:[n.jsx("div",{className:"admin-brand",children:"SAGA ENGINE · ADMIN"}),n.jsxs("div",{className:"admin-login-copy",children:[n.jsx("h1",{children:"Mission Control"}),n.jsx("p",{children:"Protected admin access"})]}),n.jsxs("div",{className:"admin-login-form",children:[n.jsx("label",{children:"Admin password"}),n.jsx("input",{type:"password",value:l,placeholder:"Enter admin password once",autoComplete:"current-password",autoFocus:!0,onChange:_=>d(_.target.value)}),n.jsx("button",{type:"submit",disabled:u==="loading",children:u==="loading"?"Unlocking…":"Unlock"})]}),u==="error"?n.jsxs("div",{className:"admin-error",children:[n.jsx("strong",{children:"Access denied"}),n.jsx("span",{children:m})]}):null,a==="error"?n.jsxs("div",{className:"admin-error",children:[n.jsx("strong",{children:"Public config unavailable"}),n.jsx("span",{children:r})]}):null,n.jsxs("div",{className:"admin-login-foot",children:[n.jsx("span",{children:"No mission data is shown before unlock."}),n.jsx("div",{children:n.jsx("a",{href:"/",children:"Player entry"})})]})]})]})]})}const zr=`
* {
  box-sizing: border-box;
}

.admin-root {
  min-height: 100vh;
  padding: 14px;
  color: #e5eefc;
  background:
    radial-gradient(circle at 0% 0%, rgba(56,189,248,0.18), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(34,197,94,0.12), transparent 30%),
    #020617;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.admin-login-layout,
.admin-console-layout {
  min-height: calc(100vh - 28px);
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 14px;
}

.admin-login-card,
.admin-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.24);
  background: rgba(15,23,42,0.76);
  box-shadow: 0 24px 80px rgba(0,0,0,0.34);
  backdrop-filter: blur(20px);
}

.admin-sidebar {
  overflow: auto;
}

.admin-brand {
  width: fit-content;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(56,189,248,0.10);
  border: 1px solid rgba(56,189,248,0.22);
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.admin-login-card h1,
.admin-sidebar h1 {
  margin: 0;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.07em;
}

.admin-sidebar h1 {
  font-size: 28px;
}

.admin-login-card p,
.admin-sidebar p {
  margin: 8px 0 0;
  color: #94a3b8;
  line-height: 1.45;
}

.admin-login-form {
  display: grid;
  gap: 9px;
}

.admin-login-form label,
.admin-detail-block > span,
.admin-kicker {
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.admin-login-form input {
  height: 44px;
  border: 1px solid rgba(148,163,184,0.25);
  border-radius: 16px;
  background: rgba(2,6,23,0.62);
  color: #e5eefc;
  padding: 0 13px;
  outline: none;
}

.admin-login-form button,
.admin-sidebar-actions button,
.admin-drawer-head button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #020617;
  font-weight: 950;
  cursor: pointer;
}

.admin-link-row,
.admin-sidebar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-link-row {
  margin-top: auto;
}

.admin-link-row a,
.admin-sidebar-actions a {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,184,0.24);
  color: #dbeafe;
  background: rgba(15,23,42,0.54);
  text-decoration: none;
  font-weight: 850;
  font-size: 12px;
}

.admin-locked-workspace,
.admin-workspace {
  min-width: 0;
  display: grid;
  gap: 14px;
}

.admin-locked-workspace {
  grid-template-rows: auto minmax(360px, 1fr) auto auto;
  padding: 18px;
  border-radius: 30px;
  border: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.48);
  box-shadow: 0 24px 80px rgba(0,0,0,0.26);
  backdrop-filter: blur(18px);
}

.admin-workspace {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.admin-workspace-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 24px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.62);
  backdrop-filter: blur(18px);
}

.admin-workspace-bar h2 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.05em;
}

.admin-locked-map {
  position: relative;
  min-height: 420px;
  border-radius: 30px;
  overflow: hidden;
  border: 1px solid rgba(148,163,184,0.18);
  background:
    linear-gradient(135deg, rgba(15,23,42,0.92), rgba(2,6,23,0.92)),
    radial-gradient(circle at 50% 50%, rgba(56,189,248,0.30), transparent 28%);
}

.admin-grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.24;
  background-image:
    linear-gradient(rgba(125,211,252,.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125,211,252,.18) 1px, transparent 1px);
  background-size: 44px 44px;
}

.admin-locked-message {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(420px, calc(100% - 40px));
  transform: translate(-50%, -50%);
  display: grid;
  gap: 8px;
  padding: 20px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(2,6,23,0.76);
  backdrop-filter: blur(20px);
  text-align: center;
  color: #cbd5e1;
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.admin-sidebar-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-stat {
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.42);
}

.admin-stat.compact {
  padding: 11px;
}

.admin-stat span {
  color: #8aa0bd;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.admin-stat strong {
  display: block;
  margin-top: 5px;
  font-size: 20px;
  font-weight: 950;
  letter-spacing: -0.05em;
  word-break: break-word;
}

.admin-stat small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-family-compact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.admin-family-compact,
.admin-family-row,
.admin-profile-card,
.admin-node-card,
.admin-muted,
.admin-detail-item,
.admin-detail-block {
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.35);
  border-radius: 18px;
}

.admin-family-compact {
  display: flex;
  gap: 10px;
  padding: 13px;
  color: #cbd5e1;
}

.admin-family-compact > span,
.admin-family-row > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(56,189,248,0.12);
  flex: 0 0 auto;
}

.admin-family-compact small,
.admin-family-row small,
.admin-profile-card small,
.admin-node-card small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
}

.admin-map-area {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
}

.admin-node-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.60);
  backdrop-filter: blur(18px);
}

.admin-node-rail-head,
.admin-section-head,
.admin-profile-card > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.admin-node-rail-head h3,
.admin-section-head h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.04em;
}

.admin-node-list,
.admin-profile-list,
.admin-family-count-list {
  display: grid;
  gap: 9px;
}

.admin-node-list {
  overflow: auto;
  padding-right: 2px;
}

.admin-node-card {
  width: 100%;
  color: inherit;
  text-align: left;
  padding: 12px;
  cursor: pointer;
  font: inherit;
}

.admin-node-card.selected {
  border-color: rgba(56,189,248,0.52);
  background: rgba(8,47,73,0.44);
  box-shadow: 0 0 0 1px rgba(56,189,248,0.16) inset;
}

.admin-node-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-node-top > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(129,140,248,0.18);
  font-weight: 950;
}

.admin-node-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-profile-card,
.admin-muted {
  padding: 12px;
}

.admin-badge-row,
.admin-topbar-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.admin-family-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 10px;
}

.pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
}

.pill.ok {
  border: 1px solid rgba(34,197,94,0.26);
  background: rgba(34,197,94,0.14);
  color: #bbf7d0;
}

.pill.warn {
  border: 1px solid rgba(251,191,36,0.26);
  background: rgba(251,191,36,0.12);
  color: #fde68a;
}

.pill.neutral {
  border: 1px solid rgba(148,163,184,0.20);
  background: rgba(148,163,184,0.10);
  color: #cbd5e1;
}

.admin-error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(248,113,113,0.28);
  background: rgba(127,29,29,0.22);
  color: #fecaca;
  font-size: 12px;
}

.admin-operator-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px;
  border-radius: 20px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.58);
  color: #cbd5e1;
}

.admin-operator-strip span {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
}

.admin-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  background: rgba(2,6,23,0.58);
  backdrop-filter: blur(8px);
}

.admin-drawer {
  width: min(560px, 100%);
  height: 100%;
  overflow: auto;
  border-left: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.94);
  box-shadow: -24px 0 80px rgba(0,0,0,0.40);
}

.admin-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.92);
  backdrop-filter: blur(18px);
}

.admin-drawer-head h2 {
  margin: 6px 0 0;
  font-size: 26px;
  line-height: 1.05;
  letter-spacing: -0.05em;
}

.admin-drawer-body {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.admin-detail-item {
  display: grid;
  gap: 4px;
  padding: 12px;
}

.admin-detail-item span {
  color: #8aa0bd;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.admin-detail-block {
  display: grid;
  gap: 8px;
  padding: 14px;
}

.admin-detail-block p {
  margin: 0;
  color: #dbeafe;
  line-height: 1.55;
}

.admin-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.admin-chip-wrap code {
  padding: 5px 8px;
  border-radius: 999px;
  color: #bae6fd;
  background: rgba(14,165,233,0.12);
  border: 1px solid rgba(14,165,233,0.20);
  font-size: 11px;
}

@media (max-width: 1100px) {
  .admin-login-layout,
  .admin-console-layout {
    grid-template-columns: 1fr;
  }

  .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-stat-grid,
  .admin-family-compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .admin-root {
    padding: 8px;
  }

  .admin-stat-grid,
  .admin-family-compact-grid,
  .admin-sidebar-stats,
  .admin-detail-grid {
    grid-template-columns: 1fr;
  }

  .admin-login-card h1 {
    font-size: 34px;
  }
}

/* Minimal protected login pass */
.admin-root-login-only {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    radial-gradient(circle at 22% 18%, rgba(125,211,252,0.22), transparent 30%),
    radial-gradient(circle at 78% 12%, rgba(129,140,248,0.18), transparent 30%),
    radial-gradient(circle at 50% 95%, rgba(34,197,94,0.12), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 38%, #b9c9dc 100%);
}

.admin-login-minimal {
  position: relative;
  width: min(430px, 100%);
}

.admin-login-card-minimal {
  position: relative;
  z-index: 2;
  min-height: auto;
  padding: 24px;
  border-radius: 34px;
  border: 1px solid rgba(255,255,255,0.62);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.42)),
    rgba(255,255,255,0.36);
  box-shadow:
    0 30px 90px rgba(15,23,42,0.22),
    inset 0 1px 0 rgba(255,255,255,0.74);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  color: #0f172a;
}

.admin-login-card-minimal .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.18);
  color: #0369a1;
}

.admin-login-copy {
  display: grid;
  gap: 8px;
  margin: 20px 0 18px;
}

.admin-login-card-minimal h1 {
  margin: 0;
  color: #0f172a;
  font-size: 42px;
  line-height: 0.92;
  letter-spacing: -0.08em;
}

.admin-login-card-minimal p {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

.admin-login-card-minimal .admin-login-form label {
  color: #0369a1;
}

.admin-login-card-minimal .admin-login-form input {
  height: 48px;
  border-color: rgba(15,23,42,0.12);
  background: rgba(255,255,255,0.62);
  color: #0f172a;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form input::placeholder {
  color: #64748b;
}

.admin-login-card-minimal .admin-login-form input:focus {
  border-color: rgba(14,165,233,0.52);
  box-shadow:
    0 0 0 4px rgba(14,165,233,0.12),
    inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form button {
  height: 48px;
  box-shadow: 0 14px 30px rgba(59,130,246,0.28);
}

.admin-login-card-minimal .admin-error {
  border-color: rgba(239,68,68,0.25);
  background: rgba(254,226,226,0.72);
  color: #7f1d1d;
}

.admin-login-foot {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  color: #64748b;
  font-size: 12px;
}

.admin-login-foot > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-login-foot a {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.38);
  color: #334155;
  text-decoration: none;
  font-weight: 850;
}

.admin-login-orb {
  position: absolute;
  z-index: 1;
  border-radius: 999px;
  filter: blur(2px);
  opacity: 0.72;
  pointer-events: none;
}

.admin-login-orb-a {
  width: 180px;
  height: 180px;
  left: -64px;
  top: -62px;
  background: radial-gradient(circle, rgba(56,189,248,0.60), transparent 68%);
}

.admin-login-orb-b {
  width: 220px;
  height: 220px;
  right: -86px;
  bottom: -82px;
  background: radial-gradient(circle, rgba(129,140,248,0.45), transparent 70%);
}

@media (max-width: 700px) {
  .admin-root-login-only {
    padding: 12px;
  }

  .admin-login-card-minimal {
    border-radius: 28px;
    padding: 20px;
  }

  .admin-login-card-minimal h1 {
    font-size: 36px;
  }
}


/* Unlocked workspace glass pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  color: #102033;
  background:
    radial-gradient(circle at 12% 8%, rgba(56,189,248,0.22), transparent 30%),
    radial-gradient(circle at 88% 6%, rgba(129,140,248,0.18), transparent 32%),
    radial-gradient(circle at 55% 96%, rgba(34,197,94,0.10), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 42%, #c4d5e8 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px);
  min-height: 0;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar,
.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-node-rail,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-stat,
.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-node-card,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-color: rgba(255,255,255,0.56);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34)),
    rgba(255,255,255,0.30);
  box-shadow:
    0 18px 42px rgba(15,23,42,0.10),
    inset 0 1px 0 rgba(255,255,255,0.58);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 14px;
  border-radius: 30px;
  gap: 12px;
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 23px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-stat small,
.admin-root:not(.admin-root-login-only) .admin-profile-card small,
.admin-root:not(.admin-root-login-only) .admin-node-card small,
.admin-root:not(.admin-root-login-only) .admin-family-row small,
.admin-root:not(.admin-root-login-only) .admin-operator-strip span {
  color: #516276;
}

.admin-root:not(.admin-root-login-only) .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.20);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a,
.admin-root:not(.admin-root-login-only) .admin-drawer-head button {
  min-height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  box-shadow: 0 12px 28px rgba(59,130,246,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  color: #334155;
  background: rgba(255,255,255,0.45);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 10px;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  color: #0f172a;
  font-size: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat span,
.admin-root:not(.admin-root-login-only) .admin-kicker,
.admin-root:not(.admin-root-login-only) .admin-detail-block > span {
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 74px;
  padding: 14px 16px;
  border-radius: 28px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 24px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  min-height: 0 !important;
  height: 100% !important;
  border-radius: 32px !important;
  border-color: rgba(255,255,255,0.58) !important;
  box-shadow:
    0 26px 80px rgba(15,23,42,0.18),
    inset 0 1px 0 rgba(255,255,255,0.55) !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  min-height: 0;
  overflow: hidden;
  padding: 12px;
  border-radius: 28px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 220px);
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  color: #102033;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card.selected {
  border-color: rgba(14,165,233,0.46);
  background:
    linear-gradient(180deg, rgba(224,242,254,0.80), rgba(255,255,255,0.44)),
    rgba(186,230,253,0.40);
  box-shadow:
    0 16px 36px rgba(14,165,233,0.14),
    inset 0 1px 0 rgba(255,255,255,0.74);
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  background: rgba(14,165,233,0.14);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .pill.ok {
  color: #166534;
  border-color: rgba(22,101,52,0.16);
  background: rgba(187,247,208,0.62);
}

.admin-root:not(.admin-root-login-only) .pill.warn {
  color: #92400e;
  border-color: rgba(146,64,14,0.16);
  background: rgba(254,243,199,0.70);
}

.admin-root:not(.admin-root-login-only) .pill.neutral {
  color: #334155;
  border-color: rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.46);
}

.admin-disclosure {
  display: grid;
  gap: 8px;
}

.admin-disclosure summary {
  list-style: none;
  cursor: pointer;
}

.admin-disclosure summary::-webkit-details-marker {
  display: none;
}

.admin-disclosure summary .admin-section-head,
.admin-disclosure summary .admin-node-rail-head {
  position: relative;
  padding-right: 22px;
}

.admin-disclosure summary .admin-section-head::after,
.admin-disclosure summary .admin-node-rail-head::after {
  content: "⌄";
  position: absolute;
  right: 0;
  top: 2px;
  color: #64748b;
  font-weight: 900;
  transition: transform .18s ease;
}

.admin-disclosure[open] summary .admin-section-head::after,
.admin-disclosure[open] summary .admin-node-rail-head::after {
  transform: rotate(180deg);
}

.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-profile-card {
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay {
  background: rgba(148,163,184,0.30);
  backdrop-filter: blur(12px);
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.58)),
    rgba(255,255,255,0.54);
  color: #102033;
  border-left: 1px solid rgba(255,255,255,0.64);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  background: rgba(255,255,255,0.70);
  border-bottom-color: rgba(15,23,42,0.08);
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  background: rgba(255,255,255,0.46);
  border-color: rgba(15,23,42,0.08);
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-detail-block p {
  color: #102033;
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto;
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 520px !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-node-list {
    max-height: none;
  }
}

@media (max-width: 760px) {
  .admin-root:not(.admin-root-login-only) {
    padding: 8px;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-workspace-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}


/* Map-first CMS workspace tightening */
.admin-root:not(.admin-root-login-only) .admin-console-layout {
  grid-template-columns: 280px minmax(0, 1fr);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 12px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 20px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p {
  font-size: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 8px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-stat small {
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 58px;
  padding: 10px 13px;
  border-radius: 23px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  grid-template-columns: minmax(0, 1fr) 245px;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  border-radius: 26px !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  padding: 9px;
  border-radius: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail-head h3 {
  font-size: 15px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 168px);
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  padding: 9px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-node-top {
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-node-meta {
  grid-template-columns: 1fr;
  gap: 3px;
  margin-top: 7px;
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-radius: 15px;
  padding: 9px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.06),
    inset 0 1px 0 rgba(255,255,255,0.52);
}

.admin-root:not(.admin-root-login-only) .admin-profile-list,
.admin-root:not(.admin-root-login-only) .admin-family-count-list {
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-family-row {
  grid-template-columns: 28px minmax(0, 1fr) auto;
}

.admin-root:not(.admin-root-login-only) .admin-family-row > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-cms-actions {
  align-items: center;
}

.admin-cms-action {
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.52);
  color: #334155;
  font-weight: 900;
  font-size: 11px;
  cursor: pointer;
}

.admin-cms-action.primary {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  border-color: transparent;
  box-shadow: 0 10px 22px rgba(59,130,246,0.18);
}

.admin-operator-strip-compact {
  min-height: 50px;
  padding: 9px 12px !important;
  border-radius: 18px !important;
}

.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact span {
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(520px, 100%);
}

@media (min-width: 1500px) {
  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 620px !important;
  }
}


/* Legacy operator shell pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  background:
    radial-gradient(circle at 18% 12%, rgba(16,185,129,0.12), transparent 28%),
    radial-gradient(circle at 84% 10%, rgba(59,130,246,0.10), transparent 30%),
    linear-gradient(180deg, #0b1220 0%, #0f172a 58%, #111827 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px) !important;
  min-height: 0 !important;
  grid-template-columns: 340px minmax(0, 1fr) !important;
  gap: 10px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  width: auto !important;
  min-width: 0 !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: auto !important;
  padding: 14px !important;
  gap: 12px !important;
  border-radius: 28px !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)),
    rgba(17,24,39,0.74) !important;
  box-shadow:
    0 20px 60px rgba(0,0,0,0.28),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
  backdrop-filter: blur(22px) saturate(135%);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-brand {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  width: auto !important;
  min-height: 40px !important;
  padding: 0 14px !important;
  border-radius: 18px !important;
  font-size: 11px !important;
  letter-spacing: 0.22em !important;
  background: rgba(255,255,255,0.08) !important;
  color: #86efac !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  margin: 0 !important;
  font-size: 18px !important;
  line-height: 1.04 !important;
  letter-spacing: -0.05em !important;
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(255,255,255,0.46) !important;
  font-size: 12px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  min-height: 42px !important;
  height: 42px !important;
  padding: 0 12px !important;
  border-radius: 14px !important;
  font-size: 12px !important;
  font-weight: 900 !important;
  text-decoration: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats,
.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-disclosure {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
    rgba(255,255,255,0.03);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 12px 30px rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head {
  display: grid;
  gap: 4px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-actions {
  display: grid;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover {
  transform: translateY(-1px);
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary {
  background: linear-gradient(135deg, rgba(16,185,129,0.28), rgba(14,165,233,0.22));
  color: #f8fafc;
  border-color: rgba(110,231,183,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(255,255,255,0.50);
  font-size: 11px;
  line-height: 1.4;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  display: grid;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  text-align: left;
  cursor: pointer;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  background: rgba(59,130,246,0.16);
  border-color: rgba(96,165,250,0.26);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255,255,255,0.10);
  color: #93c5fd;
  font-size: 13px;
  font-weight: 900;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  display: block;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.15;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item small {
  display: block;
  margin-top: 4px;
  color: rgba(255,255,255,0.54);
  font-size: 10px;
  line-height: 1.35;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.50);
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  height: 100% !important;
  min-height: 0 !important;
  grid-template-rows: minmax(0, 1fr) !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-topbar-pills,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact,
.admin-root:not(.admin-root-login-only) .admin-node-rail {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  height: 100% !important;
  min-height: 0 !important;
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
  height: 100% !important;
  min-height: 0 !important;
  border-radius: 28px !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03)),
    rgba(255,255,255,0.03) !important;
  box-shadow:
    0 22px 60px rgba(0,0,0,0.24),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(480px, calc(100vw - 28px)) !important;
  border-left: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(17,24,39,0.92), rgba(17,24,39,0.96)) !important;
  backdrop-filter: blur(24px) saturate(125%);
  -webkit-backdrop-filter: blur(24px) saturate(125%);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head,
.admin-root:not(.admin-root-login-only) .admin-drawer-body {
  padding: 16px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-grid {
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  border-radius: 16px !important;
  padding: 12px !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background: rgba(255,255,255,0.03) !important;
}

@media (max-width: 1180px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto !important;
    grid-template-columns: 1fr !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar {
    height: auto !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
    min-height: 72vh !important;
  }
}



/* Local CMS actions and editable drawer pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  text-shadow: 0 1px 0 rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action.active {
  background: rgba(59,130,246,0.22);
  border-color: rgba(147,197,253,0.34);
  color: #f8fafc;
}

.admin-local-notice {
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(110,231,183,0.18);
  background: rgba(16,185,129,0.12);
  color: rgba(236,253,245,0.86);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel {
  display: grid;
  gap: 9px;
  padding: 11px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
}

.admin-cms-local-panel > strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-cms-local-panel > span,
.admin-cms-local-panel label {
  color: rgba(255,255,255,0.58);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel label {
  display: grid;
  gap: 5px;
}

.admin-cms-local-panel input {
  min-height: 36px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(15,23,42,0.54);
  color: #f8fafc;
}

.admin-local-list {
  display: grid;
  gap: 6px;
}

.admin-local-row {
  display: grid;
  gap: 3px;
  min-height: 40px;
  padding: 8px 9px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #f8fafc;
  text-align: left;
}

.admin-local-row.static {
  cursor: default;
}

.admin-local-row small {
  color: rgba(255,255,255,0.52);
}

.admin-drawer-editable .admin-drawer-body {
  gap: 12px;
}

.admin-edit-section {
  display: grid;
  gap: 10px;
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.035);
}

.admin-edit-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.admin-edit-section-head strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-edit-section-head span {
  color: rgba(255,255,255,0.48);
  font-size: 11px;
}

.admin-edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.admin-edit-field {
  display: grid;
  gap: 6px;
  color: rgba(255,255,255,0.62);
  font-size: 11px;
  font-weight: 850;
}

.admin-edit-field input,
.admin-edit-field select,
.admin-edit-field textarea {
  width: 100%;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  background: rgba(15,23,42,0.56);
  color: #f8fafc;
  padding: 10px;
  font: inherit;
  outline: none;
}

.admin-edit-field input,
.admin-edit-field select {
  min-height: 39px;
}

.admin-edit-field textarea {
  resize: vertical;
  line-height: 1.45;
}

.admin-edit-field input:focus,
.admin-edit-field select:focus,
.admin-edit-field textarea:focus {
  border-color: rgba(96,165,250,0.48);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.16);
}

.admin-edit-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,0.72);
  font-size: 12px;
  font-weight: 850;
}

.admin-edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

@media (max-width: 620px) {
  .admin-edit-grid,
  .admin-edit-actions {
    grid-template-columns: 1fr;
  }
}



/* Persistent save flow pass */
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: rgba(14,165,233,0.16);
  border-color: rgba(125,211,252,0.26);
  color: #e0f2fe;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save:disabled {
  opacity: 0.68;
  cursor: wait;
}

.admin-save-error {
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(248,113,113,0.26);
  background: rgba(127,29,29,0.24);
  color: #fecaca;
  font-size: 11px;
  line-height: 1.35;
}

.admin-save-error strong {
  color: #fee2e2;
}



/* Eliminar nodo and CMS clarity pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar {
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.45) transparent;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  color: #ffffff !important;
  font-size: 19px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(226,232,240,0.76) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  grid-template-columns: 1fr !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  text-align: left;
  justify-content: flex-start;
  background: rgba(14,165,233,0.12) !important;
  border-color: rgba(125,211,252,0.18) !important;
  color: #e0f2fe !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  gap: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  font-size: 15px;
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.76);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action::after {
  content: "›";
  opacity: .45;
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger::after {
  content: "";
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.30);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger:hover {
  background: rgba(153,27,27,0.42);
  border-color: rgba(252,165,165,0.38);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  max-height: 44vh;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  position: relative;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  box-shadow: inset 0 0 0 1px rgba(147,197,253,0.20), 0 12px 28px rgba(0,0,0,0.18);
}

.admin-sidebar-node-coords {
  color: rgba(186,230,253,0.70) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.admin-edit-actions-three {
  grid-template-columns: 1fr 1fr 1fr;
}

.admin-drawer-editable .admin-drawer-head h2 {
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  color: #d1fae5;
}

@media (max-width: 760px) {
  .admin-edit-actions-three {
    grid-template-columns: 1fr;
  }
}



/* Resilient save and modern CMS polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > strong,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-sidebar small,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > span,
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.78) !important;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  border-radius: 16px;
  transition: transform 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: linear-gradient(180deg, rgba(14,165,233,0.24), rgba(14,165,233,0.14));
  border-color: rgba(125,211,252,0.32);
  box-shadow: 0 10px 26px rgba(14,165,233,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.32);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  border: 1px solid rgba(74,222,128,0.22);
  background: rgba(20,83,45,0.24);
  color: #dcfce7;
}

.admin-root:not(.admin-root-login-only) .admin-save-error {
  border-radius: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input,
.admin-root:not(.admin-root-login-only) .admin-edit-field select,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea {
  border-radius: 14px;
  background: rgba(2,6,23,0.66);
  color: #f8fafc;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field select:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}



/* Map node interaction polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  border: 1px solid rgba(125,211,252,0.16);
  background: rgba(14,165,233,0.08);
  padding: 10px 11px;
  border-radius: 14px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  color: rgba(226,232,240,0.78);
  border: 1px dashed rgba(125,211,252,0.20);
  background: rgba(14,165,233,0.07);
}

.admin-root:not(.admin-root-login-only) .admin-node-map-hint {
  color: rgba(226,232,240,0.76);
}



/* Non-blocking map editor drawer */
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking {
  pointer-events: none !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking .admin-drawer {
  pointer-events: auto !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::before,
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::after {
  pointer-events: none !important;
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  box-shadow:
    -22px 0 60px rgba(2,6,23,0.38),
    inset 1px 0 0 rgba(255,255,255,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  cursor: default;
}

.admin-root:not(.admin-root-login-only) .admin-map-dragging-node {
  cursor: grabbing !important;
}



/* Node reorder controls */
.admin-reorder-section {
  border-color: rgba(125,211,252,0.14);
  background:
    radial-gradient(circle at top left, rgba(14,165,233,0.10), transparent 42%),
    rgba(255,255,255,0.035);
}

.admin-reorder-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.admin-reorder-actions .admin-cms-side-action {
  justify-content: center;
  min-height: 42px;
  text-align: center;
}

.admin-reorder-actions .admin-cms-side-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  transform: none !important;
}

.admin-reorder-note {
  color: rgba(226,232,240,0.72);
  font-size: 11px;
  line-height: 1.35;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item span:first-child,
.admin-root:not(.admin-root-login-only) .admin-node-card .admin-node-top > span {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .admin-reorder-actions {
    grid-template-columns: 1fr;
  }
}



/* Persistent mission settings */
.admin-settings-panel {
  max-height: 52vh;
  overflow: auto;
  padding-right: 3px;
}

.admin-settings-panel label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-settings-panel input,
.admin-settings-panel select,
.admin-settings-panel textarea {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-settings-panel textarea {
  min-height: 74px;
  resize: vertical;
}

.admin-settings-panel input:focus,
.admin-settings-panel select:focus,
.admin-settings-panel textarea:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}

.admin-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.admin-settings-grid label:last-child {
  grid-column: 1 / -1;
}

@media (max-width: 760px) {
  .admin-settings-grid {
    grid-template-columns: 1fr;
  }
}



/* Persistent player profile editor */
.admin-players-panel {
  max-height: 52vh;
  overflow: auto;
  padding-right: 3px;
}

.admin-player-editor-list {
  display: grid;
  gap: 10px;
}

.admin-player-editor-card {
  display: grid;
  gap: 9px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.34);
}

.admin-player-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.admin-player-editor-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-player-editor-head .admin-cms-side-action {
  width: auto;
  min-height: 34px;
  padding: 0 10px;
  font-size: 10px;
}

.admin-player-editor-card label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-player-editor-card input,
.admin-player-editor-card select {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-player-editor-card input:focus,
.admin-player-editor-card select:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}

.admin-player-editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.admin-player-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

@media (max-width: 760px) {
  .admin-player-editor-grid,
  .admin-player-actions {
    grid-template-columns: 1fr;
  }
}



/* Family config editor */
.admin-family-config-section {
  border-color: rgba(168,85,247,0.18);
  background:
    radial-gradient(circle at top left, rgba(168,85,247,0.10), transparent 42%),
    rgba(255,255,255,0.035);
}

.admin-family-config-grid {
  display: grid;
  gap: 9px;
}

.admin-family-config-grid label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-family-config-grid input {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-family-config-grid input:focus {
  border-color: rgba(168,85,247,0.44);
  box-shadow: 0 0 0 4px rgba(168,85,247,0.12);
}

.admin-family-config-note {
  color: rgba(226,232,240,0.68);
  font-size: 11px;
  line-height: 1.35;
}


`;export{Ug as default};
