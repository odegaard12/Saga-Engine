
window.initCryptex = function(container_ref, config) {
    var el = (typeof container_ref === 'string' ? document.getElementById(container_ref) : container_ref);
    if (!el) return console.error("Error: No container");

    el.innerHTML = '';
    var style = document.createElement('style');
    style.textContent = `
        .gia-terminal { 
            background: #050505; color: #33ff33; font-family: 'Courier New', monospace; 
            padding: 20px; border: 2px solid #33ff33; max-width: 850px; margin: 0 auto;
            box-shadow: inset 0 0 15px rgba(0,255,0,0.1);
        }
        .term-title { text-align: center; border-bottom: 2px solid #33ff33; padding-bottom: 10px; margin-bottom: 15px; font-weight: bold; font-size: 1.3em; }
        .clues-box { background: #001100; border: 1px dashed #005500; padding: 15px; margin-bottom: 20px; font-size: 0.95em; line-height: 1.5; }
        .clue-row { margin-bottom: 8px; display: flex; gap: 10px; align-items: flex-start; }
        .rings-wrapper { display: flex; justify-content: center; gap: 15px; margin: 25px 0; flex-wrap: wrap; }
        .ring-card { 
            border: 1px solid #33ff33; background: #000; padding: 15px; min-width: 130px; 
            cursor: pointer; text-align: center; flex: 1; transition: 0.2s;
        }
        .ring-card:hover { background: #002200; box-shadow: 0 0 10px #00ff00; }
        .ring-label { font-size: 0.7em; color: #00aa00; text-transform: uppercase; border-bottom: 1px solid #004400; margin-bottom: 8px; }
        .ring-val { font-size: 1.2em; font-weight: bold; color: #fff; }
        .btn-validate { 
            width: 100%; background: #000; color: #33ff33; border: 2px solid #33ff33; 
            padding: 15px; font-size: 1.2em; cursor: pointer; font-family: monospace; font-weight: bold;
        }
        .btn-validate:hover { background: #33ff33; color: #000; }
        .status-msg { margin-top: 15px; text-align: center; font-weight: bold; min-height: 25px; }
        @media (max-width: 600px) { .rings-wrapper { flex-direction: column; } .ring-card { width: 100% !important; } }
    `;
    el.appendChild(style);

    el.innerHTML += `
        <div class="gia-terminal">
            <div class="term-title">NODE DIAL</div>
            <div class="clues-box">
                <div class="clue-row"><span>⚓</span> <span>A Áncora afúndese no rumbo do X (onde o día <b>comeza</b>).</span></div>
                <div class="clue-row"><span>⚡</span> <span>O Faro marca quendas de garda. Xa pasamos a primeira.</span></div>
                <div class="clue-row"><span>★</span> <span>A Estrela non pode compartir rumbo coa Áncora (onde o día <b>se deita</b>).</span></div>
            </div>
            <div id="ring-area" class="rings-wrapper"></div>
            <button id="val-btn" class="btn-validate">VALIDAR ALIÑAMENTO</button>
            <div id="status-out" class="status-msg"></div>
        </div>
    `;

    var data = [
        { label: "DIRECTION (START)", opts: ["NORTH", "EAST", "SOUTH", "WEST", "CENTER"] },
        { label: "GUARD ORDER",    opts: ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"] },
        { label: "DIRECTION (END)", opts: ["NORTH", "EAST", "SOUTH", "WEST", "CENTER"] }
    ];
    // SOLUTION: EAST - SECOND - SOUTH
    var target = ["EAST", "SECOND", "SOUTH"];
    var current = [0, 0, 0];

    data.forEach(function(r, i) {
        var div = document.createElement('div');
        div.className = 'ring-card';
        div.innerHTML = '<div class="ring-label">'+r.label+'</div><div class="ring-val" id="rv-'+i+'">'+r.opts[0]+'</div>';
        div.onclick = function() {
            current[i] = (current[i] + 1) % r.opts.length;
            document.getElementById('rv-'+i).innerText = r.opts[current[i]];
            document.getElementById('status-out').innerText = '';
        };
        el.querySelector('#ring-area').appendChild(div);
    });

    el.querySelector('#val-btn').onclick = function() {
        var res = current.map((idx, i) => data[i].opts[idx]);
        var out = document.getElementById('status-out');
        if (res[0] === target[0] && res[1] === target[1] && res[2] === target[2]) {
            out.innerText = ">> SINCRONIZACIÓN EXITOSA. SEGUNDA RUNA LIBERADA.";
            out.style.color = "#33ff33";
            setTimeout(function() { if(window.winGame) window.winGame(); }, 1500);
        } else {
            out.innerText = ">> ERROR: DESALIÑAMENTO DETECTADO";
            out.style.color = "#ff3333";
        }
    };
};


// --- NODO: NODE (DIGITAL TUNER) ---
window.initDigitalTuner = function(container_ref, config) {
  var el = (typeof container_ref === 'string' ? document.getElementById(container_ref) : container_ref);
  if (!el) return;

  config = config || {};

  // ====== LOOK & FEEL ======
  var col = '#ff3333';
  var bg  = '#1a0505';

  // ====== CONFIG DEFAULTS (editable desde stages.json -> config) ======
  var target = (config.target) || { freq: 95.5, gain: 80, az: 180 };

  // tolerancias (si quieres más difícil: baja estos valores)
  var tol = (config.tol) || { freq: 0.2, gain: 2, az: 4 };

  // duración de purga (segundos)
  var HOLD_S = (typeof config.hold_s === 'number') ? config.hold_s : 7.0;

  // deriva / jitter (si quieres más difícil: súbelo un poco)
  var drift  = (config.drift)  || { freq: 0.015, gain: 0.06, az: 0.10 };
  var jitter = (config.jitter) || { freq: 0.020, gain: 0.20, az: 0.25 };

  // acoplamientos (tocar una perilla mueve ligeramente otra)
  var coupling = (config.coupling) || { freq_to_gain: 0.10, gain_to_freq: 0.06, az_to_freq: 0.03 };

  // comportamiento al fallar en fase 2
  var failsResetHold = (typeof config.fails_reset_hold === 'boolean') ? config.fails_reset_hold : false; // false = pierde progreso, true = resetea a 0
  var maxFails = (typeof config.max_fails === 'number') ? config.max_fails : 3;

  // pasos finos por defecto (porque el target es exacto)
  var steps = (config.steps) || { freq: 0.1, gain: 1, az: 1 };

  // límites
  var lim = {
    freq: { min: 88.0, max: 108.0 },
    gain: { min: 0, max: 100 },
    az:   { min: 0, max: 360 }
  };

  // ====== HELPERS ======
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function wrap360(x){
    x = x % 360;
    if (x < 0) x += 360;
    return x;
  }
  function fmt(v, d){
    if (typeof d === 'number') return v.toFixed(d);
    return (v % 1 === 0) ? String(v) : v.toFixed(1);
  }
  function within(v, t, e){ return Math.abs(v - t) <= e; }
  function okAll(){
    return within(state.freq, target.freq, tol.freq)
        && within(state.gain, target.gain, tol.gain)
        && within(angleDiff(state.az, target.az), 0, tol.az);
  }
  function angleDiff(a,b){
    // devuelve diferencia mínima absoluta en grados
    var d = Math.abs(wrap360(a) - wrap360(b));
    return Math.min(d, 360 - d);
  }

  // ====== STATE ======
  var state = {
    freq: (typeof config.start_freq === 'number') ? config.start_freq : 92.0,
    gain: (typeof config.start_gain === 'number') ? config.start_gain : 20,
    az:   (typeof config.start_az   === 'number') ? config.start_az   : 90
  };

  var phase = 1;      // 1 = sintonía, 2 = purga
  var hold = 0;       // progreso de estabilidad en segundos
  var fails = 0;
  var raf = 0;
  var lastT = 0;
  var purgeActive = false;

  // ====== UI ======
  el.innerHTML = '';
  var style = document.createElement('style');
  style.textContent = `
    .dt-panel { background:#000; border:2px solid ${col}; padding:12px; max-width:560px; margin:0 auto; font-family:monospace; max-height:82vh; overflow:auto; }
    .dt-header { text-align:center; color:${col}; border-bottom:2px solid ${col}; margin-bottom:10px; font-weight:bold; font-size:1.15em; padding-bottom:10px; letter-spacing:1px; }
; }
    .dt-grid { display:grid; grid-template-columns: 1fr; gap:10px; }
    .dt-module { border:1px solid #440000; padding:8px; background:rgba(255,0,0,.03); border-radius:12px; }
    .dt-label { color:${col}; font-size:.75em; text-transform:uppercase; display:flex; justify-content:space-between; opacity:.95; }
    .dt-screen { background:#2a0000; color:#ffaaaa; font-size:1.25em; font-weight:bold; text-align:center; padding:8px; border:1px inset ${col}; margin:7px 0 10px; text-shadow:0 0 6px ${col}; letter-spacing:2px; border-radius:10px; }
    .dt-controls { display:flex; gap:10px; }
    .dt-btn { flex:1; background:#110000; color:${col}; border:1px solid ${col}; font-size:1.2em; cursor:pointer; padding:8px; transition:all .08s; user-select:none; border-radius:12px; }
    .dt-btn:active { background:${col}; color:#000; transform:scale(.98); }
    .dt-action { width:100%; background:${col}; color:#000; font-weight:900; padding:12px; border:none; font-size:1.05em; cursor:pointer; margin-top:10px; border-radius:14px; letter-spacing:1px; text-transform:uppercase; }
    .dt-action[disabled]{ opacity:.35; cursor:not-allowed; }
    .dt-bars { margin-top:10px; border:1px solid #440000; padding:8px; border-radius:14px; background:rgba(255,0,0,.02); }
    .dt-row { display:flex; align-items:center; gap:10px; margin:6px 0; }
    .dt-k { color:${col}; font-size:.75em; width:78px; text-transform:uppercase; }
    .dt-bar { flex:1; height:10px; background:#111; border:1px solid #550000; border-radius:999px; overflow:hidden; }
    .dt-bar > div { height:100%; width:0%; background:linear-gradient(90deg, ${col}, #ff7777); transition:width .08s; }
    .dt-status { margin-top:10px; text-align:center; font-weight:900; min-height:22px; color:${col}; letter-spacing:.5px; }
    .dt-chip { display:inline-block; padding:3px 10px; border:1px solid ${col}; border-radius:999px; font-size:.75em; margin-left:8px; }
    .dt-ok { color:#33ff33 !important; border-color:#33ff33 !important; }
    .dt-warn { color:#ffaa00 !important; border-color:#ffaa00 !important; }
    .dt-bad { color:#ff3333 !important; border-color:#ff3333 !important; }
  `;
  el.appendChild(style);

  el.innerHTML += `
    <div class="dt-panel" id="dtp">
      <div class="dt-header">PUNTA NODE · ERRO VERMELLO</div>
      <div class="dt-grid" id="dt-modules"></div>

      <div class="dt-bars">
        <div class="dt-row">
          <div class="dt-k">CANLE</div>
          <div class="dt-bar"><div id="dt-lock"></div></div>
          <div id="dt-lock-txt" class="dt-chip dt-bad">NON BLOQUEADA</div>
        </div>
        <div class="dt-row">
          <div class="dt-k">RUÍDO</div>
          <div class="dt-bar"><div id="dt-noise"></div></div>
          <div id="dt-noise-txt" class="dt-chip dt-warn">ALTO</div>
        </div>
        <div class="dt-row">
          <div class="dt-k">PURGA</div>
          <div class="dt-bar"><div id="dt-hold"></div></div>
          <div id="dt-hold-txt" class="dt-chip dt-warn">0.0s</div>
        </div>
        <div class="dt-row">
          <div class="dt-k">FALLOS</div>
          <div style="color:#fff;font-weight:800" id="dt-fails">0/${maxFails}</div>
        </div>
      </div>

      <button id="dt-purge" class="dt-action" disabled>INICIAR PURGA</button>
      <div id="dt-msg" class="dt-status">Axusta parámetros para bloquear a canle…</div>
    </div>
  `;

  var modules = [
    { key:'freq', label:'FREQ (MHz)', decimals:1, step:steps.freq, min:lim.freq.min, max:lim.freq.max },
    { key:'gain', label:'GAIN (%)',   decimals:0, step:steps.gain, min:lim.gain.min, max:lim.gain.max },
    { key:'az',   label:'AZIMUT (º)', decimals:0, step:steps.az,   min:lim.az.min,   max:lim.az.max, wrap:true }
  ];

  var modWrap = el.querySelector('#dt-modules');

  modules.forEach(function(m, idx){
    var div = document.createElement('div');
    div.className = 'dt-module';
    div.innerHTML = `
      <div class="dt-label"><span>${m.label}</span><span id="dt-delta-${m.key}"></span></div>
      <div class="dt-screen" id="dt-scr-${m.key}">--</div>
      <div class="dt-controls">
        <button class="dt-btn" id="btn-dec-${m.key}">-</button>
        <button class="dt-btn" id="btn-inc-${m.key}">+</button>
      </div>
    `;
    modWrap.appendChild(div);

    function press(dir){
      updateVal(m.key, dir);
    }

    // click normal
    div.querySelector('#btn-dec-'+m.key).onclick = function(){ press(-1); };
    div.querySelector('#btn-inc-'+m.key).onclick = function(){ press( 1); };

    // mantener pulsado (mouse/touch)
    function holdBtn(btn, dir){
      var t = 0;
      var rep = function(){
        press(dir);
        t = setTimeout(rep, 90);
      };
      var start = function(ev){
        ev && ev.preventDefault && ev.preventDefault();
        if (t) return;
        press(dir);
        t = setTimeout(rep, 220);
      };
      var stop = function(){
        if (t){ clearTimeout(t); t = 0; }
      };

      btn.addEventListener('mousedown', start);
      btn.addEventListener('touchstart', start, {passive:false});
      window.addEventListener('mouseup', stop);
      window.addEventListener('touchend', stop);
      window.addEventListener('touchcancel', stop);
      btn.addEventListener('mouseleave', stop);
    }

    holdBtn(div.querySelector('#btn-dec-'+m.key), -1);
    holdBtn(div.querySelector('#btn-inc-'+m.key),  1);
  });

  var btnPurge = el.querySelector('#dt-purge');
  var msg = el.querySelector('#dt-msg');
  var lockBar = el.querySelector('#dt-lock');
  var lockTxt = el.querySelector('#dt-lock-txt');
  var noiseBar = el.querySelector('#dt-noise');
  var noiseTxt = el.querySelector('#dt-noise-txt');
  var holdBar = el.querySelector('#dt-hold');
  var holdTxt = el.querySelector('#dt-hold-txt');
  var failsTxt = el.querySelector('#dt-fails');
  var panel = el.querySelector('#dtp');

  function updateVal(key, dir){
    var step = modules.find(x=>x.key===key).step;
    var v = state[key] + step * dir;

    // acoplamiento (realista): tocar algo mueve ligeramente otra cosa
    if (key === 'freq'){
      state.gain = clamp(state.gain + (Math.random()-0.5)*coupling.freq_to_gain*10, lim.gain.min, lim.gain.max);
    }
    if (key === 'gain'){
      state.freq = clamp(state.freq + (Math.random()-0.5)*coupling.gain_to_freq*0.2, lim.freq.min, lim.freq.max);
    }
    if (key === 'az'){
      state.freq = clamp(state.freq + (Math.random()-0.5)*coupling.az_to_freq*0.2, lim.freq.min, lim.freq.max);
    }

    // clamp / wrap
    if (key === 'az'){
      v = wrap360(v);
    } else if (key === 'freq'){
      v = clamp(v, lim.freq.min, lim.freq.max);
      v = Math.round(v*10)/10; // 0.1
    } else if (key === 'gain'){
      v = clamp(v, lim.gain.min, lim.gain.max);
      v = Math.round(v);
    }

    state[key] = v;
    render();
  }

  function render(){
    modules.forEach(function(m){
      var v = state[m.key];
      var scr = document.getElementById('dt-scr-'+m.key);
      if (scr) scr.innerText = fmt(v, m.decimals);

      var dEl = document.getElementById('dt-delta-'+m.key);
      if (dEl){
        var d = (m.key==='az') ? angleDiff(v, target.az) : Math.abs(v - target[m.key]);
        var ok = (m.key==='az') ? (d <= tol.az) : (d <= tol[m.key]);
        dEl.innerText = ok ? "✓" : ("Δ " + (m.key==='freq' ? d.toFixed(1) : Math.round(d)));
        dEl.style.color = ok ? "#33ff33" : col;
        dEl.style.fontWeight = "900";
      }
    });

    // lock visualization
    var locked = okAll();
    lockBar.style.width = locked ? "100%" : "0%";
    lockTxt.textContent = locked ? "BLOQUEADA" : "NON BLOQUEADA";
    lockTxt.classList.toggle("dt-ok", locked);
    lockTxt.classList.toggle("dt-bad", !locked);

    // botón purga
    btnPurge.disabled = !locked;
    if (phase === 1){
      msg.textContent = locked ? "CANLE BLOQUEADA. Lista para PURGA." : "Axusta parámetros para bloquear a canle…";
      panel.style.borderColor = locked ? "#ffaa00" : col;
    }
  }

  // ====== PHASE CONTROL ======
  btnPurge.onclick = function(){
    if (!okAll()) return;
    phase = 2;
    purgeActive = true;
    hold = 0;
    msg.textContent = "PURGA ACTIVA: mantén a canle estable…";
    panel.style.borderColor = "#ffaa00";
    btnPurge.disabled = true;
    btnPurge.textContent = "PURGA EN CURSO…";
  };

  function setNoiseLevel(x01){
    // 1.0 = mucho ruido, 0.0 = limpio
    var p = clamp(x01, 0, 1);
    noiseBar.style.width = (p*100).toFixed(1) + "%";
    if (p > 0.66){
      noiseTxt.textContent = "ALTO";
      noiseTxt.className = "dt-chip dt-warn";
    } else if (p > 0.33){
      noiseTxt.textContent = "MEDIO";
      noiseTxt.className = "dt-chip dt-warn";
    } else {
      noiseTxt.textContent = "BAIXO";
      noiseTxt.className = "dt-chip dt-ok";
    }
  }

  function tick(t){
    if (!lastT) lastT = t;
    var dt = Math.min(0.05, (t - lastT)/1000);
    lastT = t;

    // si estamos en fase 2, meter deriva/jitter: el "ruido" empuja los parámetros
    if (phase === 2 && purgeActive){
      // deriva suave
      state.freq = clamp(state.freq + (Math.random()-0.5)*drift.freq, lim.freq.min, lim.freq.max);
      state.gain = clamp(state.gain + (Math.random()-0.5)*drift.gain, lim.gain.min, lim.gain.max);
      state.az   = wrap360(state.az + (Math.random()-0.5)*drift.az);

      // jitter (picos)
      state.freq = clamp(state.freq + (Math.random()-0.5)*jitter.freq, lim.freq.min, lim.freq.max);
      state.gain = clamp(state.gain + (Math.random()-0.5)*jitter.gain, lim.gain.min, lim.gain.max);
      state.az   = wrap360(state.az + (Math.random()-0.5)*jitter.az);

      // redondeos para que no quede feo en pantalla
      state.freq = Math.round(state.freq*10)/10;
      state.gain = Math.round(state.gain);

      var ok = okAll();

      if (ok){
        // sumar progreso
        hold += dt;
      } else {
        // perder progreso (o reset)
        hold = failsResetHold ? 0 : Math.max(0, hold - dt*1.4);
      }

      // UI progress
      holdBar.style.width = (clamp(hold / HOLD_S, 0, 1) * 100).toFixed(1) + "%";
      holdTxt.textContent = hold.toFixed(1) + "s";

      // ruido baja según progreso
      var noise = 1 - clamp(hold / HOLD_S, 0, 1);
      setNoiseLevel(noise);

      // fallos contados si sales mucho tiempo (anti-spam)
      // criterio: si se vacía mucho el progreso por estar fuera, cuenta "fallo"
      if (!ok && hold <= 0.01){
        // para no contar 100 veces: solo si ha pasado algo de tiempo desde inicio
        // truco: cuando baja a ~0 y seguimos fuera, contamos una vez y hacemos "cooldown"
        fails += 1;
        failsTxt.textContent = fails + "/" + maxFails;
        msg.textContent = "INTERFERENCIA: perdeuse o bloqueo.";
        panel.style.borderColor = col;

        // mini-pausa para evitar spam de fallos por frame
        purgeActive = false;
        setTimeout(function(){
          purgeActive = true;
          msg.textContent = "PURGA ACTIVA: mantén a canle estable…";
          panel.style.borderColor = "#ffaa00";
        }, 600);

        if (fails >= maxFails){
          // reinicio de fase 2
          phase = 1;
          purgeActive = false;
          hold = 0;
          setNoiseLevel(1);
          holdBar.style.width = "0%";
          holdTxt.textContent = "0.0s";
          btnPurge.disabled = !okAll();
          btnPurge.textContent = "INICIAR PURGA";
          msg.textContent = "SOBRECARGA: Protocolo reiniciado. Volve bloquear a canle.";
          panel.style.borderColor = col;
        }
      }

      // win
      if (hold >= HOLD_S){
        msg.textContent = ">> CANLE LIMPA · RUNA DA VOZ LIBERADA <<";
        msg.style.color = "#33ff33";
        panel.style.borderColor = "#33ff33";
        setNoiseLevel(0);
        purgeActive = false;
        btnPurge.disabled = true;
        btnPurge.textContent = "COMPLETADO ✓";
        setTimeout(function(){ if(window.winGame) window.winGame(); }, 1200);
        return; // parar loop
      }
    }

    render();
    raf = requestAnimationFrame(tick);
  }

  // init UI
  failsTxt.textContent = "0/" + maxFails;
  setNoiseLevel(1);
  holdBar.style.width = "0%";
  holdTxt.textContent = "0.0s";
  render();
  raf = requestAnimationFrame(tick);
};

// ==========================================
// JUEGO 3: NODE (GYRO STORM) - ÁMBAR
// Misión: Estabilidad (10s sin salir del centro)
// ==========================================
window.initGyro = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    var col = '#ffaa00'; // Ámbar Alerta
    
    // ESTILOS
    var s = document.createElement('style');
    s.textContent = '.gy-box{background:#110500;border:2px solid '+col+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+col+';position:relative;overflow:hidden}'+
                    '.gy-tit{text-align:center;border-bottom:2px solid '+col+';margin-bottom:10px;font-weight:bold}'+
                    '.gy-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:center}'+
                    '.gy-area{width:250px;height:250px;border:2px dashed '+col+';border-radius:50%;margin:20px auto;position:relative;background:radial-gradient(circle, #331100 0%, #000 70%)}'+
                    '.gy-safe{width:60px;height:60px;border:2px solid #fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);box-shadow:0 0 10px '+col+'}'+
                    '.gy-ball{width:20px;height:20px;background:#fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);transition:transform 0.1s linear}'+
                    '.gy-time{font-size:2em;font-weight:bold;text-align:center;margin:10px 0;text-shadow:0 0 5px '+col+'}'+
                    '.gy-btn{width:100%;background:'+col+';color:#000;font-weight:bold;padding:12px;border:none;font-size:1.1em;cursor:pointer;margin-top:10px}'+
                    '.gy-st{margin-top:10px;text-align:center;font-weight:bold;height:20px}';
    el.appendChild(s);

    // HTML
    el.innerHTML += '<div class="gy-box"><div class="gy-tit">PRAIA DE NODE · ANCORAXE</div>'+
                    '<div class="gy-inf">AVISO: Vento forte. Mantén o nivel no centro 10s. Se saes, reiníciase.</div>'+
                    '<div class="gy-area"><div class="gy-safe"></div><div id="ball" class="gy-ball"></div></div>'+
                    '<div id="timer" class="gy-time">0.00</div>'+
                    '<button id="gy-start" class="gy-btn">INICIAR ESTABILIZADOR</button>'+
                    '<div id="gy-st" class="gy-st">Esperando sensores...</div></div>';

    var ball = el.querySelector('#ball');
    var timerDisplay = el.querySelector('#timer');
    var status = el.querySelector('#gy-st');
    var btn = el.querySelector('#gy-start');
    
    var time = 0;
    var maxTime = 10.0;
    var active = false;
    var x = 0, y = 0; // Posición bola
    var vx = 0, vy = 0; // Velocidad
    
    // CONFIGURACIÓN DIFICULTAD
    var friction = 0.92;
    var sensitivity = 0.8; 
    var windForce = 0.8; // Fuerza del "Viento Digital"
    var safeRadius = 30; // Radio zona segura (px)

    // LOOP DE FÍSICA
    function loop() {
        if(!active) return;
        
        // Viento aleatorio
        vx += (Math.random() - 0.5) * windForce;
        vy += (Math.random() - 0.5) * windForce;
        
        // Aplicar velocidad
        x += vx;
        y += vy;
        
        // Fricción (para que no se vaya al infinito)
        vx *= friction;
        vy *= friction;
        
        // Límites del contenedor (visual)
        var limit = 110;
        if(x > limit) x = limit; if(x < -limit) x = -limit;
        if(y > limit) y = limit; if(y < -limit) y = -limit;

        // Actualizar visual
        ball.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        
        // Comprobar si está en zona segura (Distancia al centro)
        var dist = Math.sqrt(x*x + y*y);
        
        if (dist < safeRadius) {
            // DENTRO
            time += 0.02; // Asumiendo 50fps aprox
            timerDisplay.style.color = "#fff";
            status.innerText = "ESTABILIZANDO...";
            
            if (time >= maxTime) {
                win();
                return;
            }
        } else {
            // FUERA -> RESET HARDCORE
            if (time > 0) {
                status.innerText = "¡DESESTABILIZADO! REINICIANDO...";
                status.style.color = "red";
                timerDisplay.style.color = "red";
            }
            time = 0;
        }
        
        timerDisplay.innerText = time.toFixed(2);
        requestAnimationFrame(loop);
    }

    // MANEJO DE SENSORES
    function handleMotion(e) {
        var ax = e.accelerationIncludingGravity.x || 0;
        var ay = e.accelerationIncludingGravity.y || 0;
        
        // Invertir ejes según orientación pantalla si es necesario
        // Simplificado: X mueve X, Y mueve Y
        vx -= ax * sensitivity;
        vy += ay * sensitivity;
    }

    // FALLBACK MOUSE (Para probar en PC)
    function handleMouse(e) {
        var rect = el.querySelector('.gy-area').getBoundingClientRect();
        var cx = rect.left + rect.width/2;
        var cy = rect.top + rect.height/2;
        var dx = (e.clientX - cx) / 10;
        var dy = (e.clientY - cy) / 10;
        vx += dx * 0.1;
        vy += dy * 0.1;
    }

    // INICIAR
    btn.onclick = function() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            // iOS 13+
            DeviceMotionEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        startEngine();
                    } else {
                        status.innerText = "PERMISO DENEGADO";
                    }
                })
                .catch(console.error);
        } else {
            // Android / PC
            startEngine();
        }
    };

    function startEngine() {
        active = true;
        btn.style.display = 'none';
        window.addEventListener('devicemotion', handleMotion);
        el.onmousemove = handleMouse; // Debug PC
        loop();
    }

    function win() {
        active = false;
        window.removeEventListener('devicemotion', handleMotion);
        el.onmousemove = null;
        status.innerText = ">> ANCLAJE COMPLETADO <<";
        status.style.color = "#33ff33";
        timerDisplay.innerText = "10.00";
        el.querySelector('.gy-box').style.borderColor = "#33ff33";
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }
};


// ==========================================
// JUEGO 3: PRAIA DE NODE (ACTUALIZADO)
// Misión: 10s de Equilibrio Perfecto (Reset si fallas)
// ==========================================
window.initGyro = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    var col = '#ffaa00'; // Ámbar
    
    // ESTILOS (Zona segura reducida a 45px)
    var s = document.createElement('style');
    s.textContent = '.gy-box{background:#150a00;border:2px solid '+col+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+col+';position:relative;overflow:hidden;user-select:none}'+
                    '.gy-tit{text-align:center;border-bottom:2px solid '+col+';margin-bottom:10px;font-weight:bold;font-size:1.1em}'+
                    '.gy-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:center;font-style:italic}'+
                    '.gy-area{width:260px;height:260px;border:2px dashed '+col+';border-radius:50%;margin:20px auto;position:relative;background:radial-gradient(circle, #441a00 0%, #000 70%);box-shadow:inset 0 0 20px #000}'+
                    '.gy-safe{width:45px;height:45px;border:2px solid #fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);box-shadow:0 0 15px '+col+';z-index:1}'+
                    '.gy-ball{width:24px;height:24px;background:#fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);z-index:2;box-shadow:0 0 5px #000}'+
                    '.gy-hud{text-align:center;margin-top:10px}'+
                    '.gy-time{font-size:2.5em;font-weight:bold;text-shadow:0 0 10px '+col+'}'+
                    '.gy-btn{width:100%;background:'+col+';color:#000;font-weight:bold;padding:12px;border:none;font-size:1.2em;cursor:pointer;margin-top:15px;text-transform:uppercase}'+
                    '.gy-st{margin-top:10px;text-align:center;font-weight:bold;min-height:20px;font-size:0.9em}';
    el.appendChild(s);

    // HTML
    el.innerHTML += '<div class="gy-box">'+
                    '<div class="gy-tit">PRAIA DE NODE · ESTABILIDADE</div>'+
                    '<div class="gy-inf">"O terreo é inestable. Mantén o nivel firme durante 10 segundos para ancorar a defensa."</div>'+
                    '<div class="gy-area"><div class="gy-safe"></div><div id="ball" class="gy-ball"></div></div>'+
                    '<div class="gy-hud"><div id="timer" class="gy-time">0.00</div></div>'+
                    '<button id="gy-start" class="gy-btn">INICIAR SISTEMA</button>'+
                    '<div id="gy-st" class="gy-st">Calibrando sensores...</div></div>';

    var ball = el.querySelector('#ball');
    var timerDisplay = el.querySelector('#timer');
    var status = el.querySelector('#gy-st');
    var btn = el.querySelector('#gy-start');
    
    // LÓGICA
    var time = 0;
    var targetTime = 10.00;
    var active = false;
    var x = 0, y = 0; 
    var vx = 0, vy = 0;
    var sensitivity = 0.5; // Ajuste sensibilidad móvil
    var friction = 0.94;
    var windForce = 0.6; // Viento digital
    
    // LOOP
    function loop() {
        if(!active) return;
        
        // Viento aleatorio (Inestabilidad del terreno)
        vx += (Math.random() - 0.5) * windForce;
        vy += (Math.random() - 0.5) * windForce;
        
        x += vx; y += vy;
        vx *= friction; vy *= friction;
        
        // Limites visuales (120px radio contenedor aprox)
        var lim = 115;
        if(x > lim) x = lim; if(x < -lim) x = -lim;
        if(y > lim) y = lim; if(y < -lim) y = -lim;

        ball.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        
        // DISTANCIA AL CENTRO
        var dist = Math.sqrt(x*x + y*y);
        var safeZone = 22; // Radio aprox de la zona segura visual (45px / 2)
        
        // Tolerancia estricta: si el centro de la bola sale del radio seguro
        if (dist < safeZone) {
            // DENTRO
            time += 0.02; 
            status.innerText = "ESTABILIZANDO...";
            status.style.color = "#fff";
            el.querySelector('.gy-safe').style.borderColor = "#3f3";
            
            if (time >= targetTime) win();
        } else {
            // FUERA -> RESET
            if (time > 0.5) {
                status.innerText = "¡INESTABLE! REINICIANDO...";
                status.style.color = "red";
                el.querySelector('.gy-safe').style.borderColor = "red";
                // Efecto visual de fallo
                timerDisplay.style.color = "red";
                setTimeout(() => timerDisplay.style.color = col, 200);
            }
            time = 0; // CASTIGO
        }
        
        if(active) {
            timerDisplay.innerText = time.toFixed(2);
            requestAnimationFrame(loop);
        }
    }

    // SENSORES
    function handleMotion(e) {
        var ax = e.accelerationIncludingGravity.x || 0;
        var ay = e.accelerationIncludingGravity.y || 0;
        
        // Ajuste según orientación (simple)
        var landscape = window.innerWidth > window.innerHeight;
        if(landscape) { vx += ay * sensitivity; vy += ax * sensitivity; }
        else { vx -= ax * sensitivity; vy += ay * sensitivity; }
    }
    
    // PC MOUSE DEBUG
    function handleMouse(e) {
        var r = el.querySelector('.gy-area').getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width/2)) / 15;
        var dy = (e.clientY - (r.top + r.height/2)) / 15;
        vx += dx * 0.1; vy += dy * 0.1;
    }

    btn.onclick = function() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().then(r => {
                if (r === 'granted') start();
                else status.innerText = "PERMISO DENEGADO (IOS)";
            }).catch(e => status.innerText = "ERROR SENSOR");
        } else {
            start();
        }
    };

    function start() {
        active = true;
        btn.style.display = 'none';
        window.addEventListener('devicemotion', handleMotion);
        el.onmousemove = handleMouse;
        loop();
    }

    function win() {
        active = false;
        window.removeEventListener('devicemotion', handleMotion);
        el.onmousemove = null;
        timerDisplay.innerText = "10.00";
        status.innerText = ">> DEFENSA ANCORADA <<";
        status.style.color = "#3f3";
        el.querySelector('.gy-box').style.borderColor = "#3f3";
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }
};


// ==========================================
// JUEGO 3: PRAIA DE NODE (AJUSTADO V2)
// Misión: 10s de Equilibrio (Sensibilidad reducida)
// ==========================================
window.initGyro = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    var col = '#ffaa00'; // Ámbar
    
    // ESTILOS (Zona segura aumentada a 55px)
    var s = document.createElement('style');
    s.textContent = '.gy-box{background:#150a00;border:2px solid '+col+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+col+';position:relative;overflow:hidden;user-select:none}'+
                    '.gy-tit{text-align:center;border-bottom:2px solid '+col+';margin-bottom:10px;font-weight:bold;font-size:1.1em}'+
                    '.gy-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:center;font-style:italic}'+
                    '.gy-area{width:260px;height:260px;border:2px dashed '+col+';border-radius:50%;margin:20px auto;position:relative;background:radial-gradient(circle, #441a00 0%, #000 70%);box-shadow:inset 0 0 20px #000}'+
                    '.gy-safe{width:55px;height:55px;border:2px solid #fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);box-shadow:0 0 15px '+col+';z-index:1}'+
                    '.gy-ball{width:24px;height:24px;background:#fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);z-index:2;box-shadow:0 0 5px #000}'+
                    '.gy-hud{text-align:center;margin-top:10px}'+
                    '.gy-time{font-size:2.5em;font-weight:bold;text-shadow:0 0 10px '+col+'}'+
                    '.gy-btn{width:100%;background:'+col+';color:#000;font-weight:bold;padding:12px;border:none;font-size:1.2em;cursor:pointer;margin-top:15px;text-transform:uppercase}'+
                    '.gy-st{margin-top:10px;text-align:center;font-weight:bold;min-height:20px;font-size:0.9em}';
    el.appendChild(s);

    el.innerHTML += '<div class="gy-box">'+
                    '<div class="gy-tit">PRAIA DE NODE · ESTABILIDADE</div>'+
                    '<div class="gy-inf">"O terreo é inestable. Mantén o nivel firme durante 10 segundos para ancorar a defensa."</div>'+
                    '<div class="gy-area"><div class="gy-safe"></div><div id="ball" class="gy-ball"></div></div>'+
                    '<div class="gy-hud"><div id="timer" class="gy-time">0.00</div></div>'+
                    '<button id="gy-start" class="gy-btn">INICIAR SISTEMA</button>'+
                    '<div id="gy-st" class="gy-st">Calibrando sensores...</div></div>';

    var ball = el.querySelector('#ball');
    var timerDisplay = el.querySelector('#timer');
    var status = el.querySelector('#gy-st');
    var btn = el.querySelector('#gy-start');
    
    // FÍSICA AJUSTADA (Modo "Control Preciso")
    var time = 0;
    var targetTime = 10.00;
    var active = false;
    var x = 0, y = 0; 
    var vx = 0, vy = 0;
    
    // --- PARÁMETROS NUEVOS ---
    var sensitivity = 0.12; // BAJADA (Antes 0.5) - Menos sensible
    var friction = 0.90;    // SUBIDA (Antes 0.94) - Frena más rápido
    var windForce = 0.2;    // BAJADA (Antes 0.6) - Menos tembleque
    // --------------------------

    function loop() {
        if(!active) return;
        
        // Viento suave
        vx += (Math.random() - 0.5) * windForce;
        vy += (Math.random() - 0.5) * windForce;
        
        x += vx; y += vy;
        vx *= friction; vy *= friction;
        
        var lim = 115;
        if(x > lim) x = lim; if(x < -lim) x = -lim;
        if(y > lim) y = lim; if(y < -lim) y = -lim;

        ball.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        
        // Zona Segura (Radio visual 55px -> radio efectivo ~27px)
        var dist = Math.sqrt(x*x + y*y);
        var safeZone = 27; 
        
        if (dist < safeZone) {
            time += 0.02; 
            status.innerText = "ESTABILIZANDO...";
            status.style.color = "#fff";
            el.querySelector('.gy-safe').style.borderColor = "#3f3";
            if (time >= targetTime) win();
        } else {
            if (time > 0.5) {
                status.innerText = "¡INESTABLE! REINICIANDO...";
                status.style.color = "red";
                el.querySelector('.gy-safe').style.borderColor = "red";
                timerDisplay.style.color = "red";
                setTimeout(() => timerDisplay.style.color = col, 200);
            }
            time = 0; 
        }
        
        if(active) {
            timerDisplay.innerText = time.toFixed(2);
            requestAnimationFrame(loop);
        }
    }

    function handleMotion(e) {
        var ax = e.accelerationIncludingGravity.x || 0;
        var ay = e.accelerationIncludingGravity.y || 0;
        
        var landscape = window.innerWidth > window.innerHeight;
        // Invertimos ejes para que se sienta más natural como una burbuja de nivel
        if(landscape) { 
            vx += ay * sensitivity; 
            vy += ax * sensitivity; 
        } else { 
            vx -= ax * sensitivity; 
            vy += ay * sensitivity; 
        }
    }
    
    // Ratón mucho menos sensible también
    function handleMouse(e) {
        var r = el.querySelector('.gy-area').getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width/2)) / 30; // Más división = menos movimiento
        var dy = (e.clientY - (r.top + r.height/2)) / 30;
        vx += dx * 0.1; vy += dy * 0.1;
    }

    btn.onclick = function() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().then(r => {
                if (r === 'granted') start();
                else status.innerText = "PERMISO DENEGADO";
            }).catch(e => status.innerText = "ERROR SENSOR");
        } else {
            start();
        }
    };

    function start() {
        active = true;
        btn.style.display = 'none';
        window.addEventListener('devicemotion', handleMotion);
        el.onmousemove = handleMouse;
        loop();
    }

    function win() {
        active = false;
        window.removeEventListener('devicemotion', handleMotion);
        el.onmousemove = null;
        timerDisplay.innerText = "10.00";
        status.innerText = ">> DEFENSA ANCORADA <<";
        status.style.color = "#3f3";
        el.querySelector('.gy-box').style.borderColor = "#3f3";
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }
};

// ==========================================
// JUEGO 4: NODE (SYSTEM SEQUENCE)
// Misión: Secuencia Viento (10011) + Turbina Inestable
// ==========================================
window.initSwitch = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    var col = '#ff5500'; // Naranja/Fuego (La meta es el fuego)
    var windCol = '#00ffff'; // Cian (El origen es el viento)

    // Estilos
    var s = document.createElement('style');
    s.textContent = '.sw-box{background:#110500;border:2px solid '+col+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+col+';user-select:none}'+
                    '.sw-tit{text-align:center;border-bottom:2px solid '+col+';margin-bottom:15px;font-weight:bold;font-size:1.2em;text-transform:uppercase}'+
                    '.sw-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4;border:1px solid #442200;padding:8px;background:#000}'+
                    '.sw-pnl{display:flex;justify-content:center;gap:8px;margin-bottom:20px;background:#050505;padding:12px;border-top:1px solid '+windCol+';border-bottom:1px solid '+windCol+'}'+
                    '.sw-unit{display:flex;flex-direction:column;align-items:center}'+
                    '.sw-lev{width:35px;height:60px;background:#111;border:2px solid #444;position:relative;cursor:pointer}'+
                    '.sw-hnd{width:29px;height:29px;background:#333;position:absolute;left:1px;transition:top 0.1s;box-shadow:inset 0 0 5px #000}'+
                    '.sw-lev.on{background:#002222;border-color:'+windCol+'}'+
                    '.sw-lev.on .sw-hnd{top:3px;background:'+windCol+';box-shadow:0 0 10px '+windCol+'}'+
                    '.sw-lev.off .sw-hnd{top:26px;background:#300}'+
                    '.sw-meter{width:100%;height:30px;background:#111;border:1px solid #555;margin-bottom:10px;position:relative;overflow:hidden}'+
                    '.sw-bar{height:100%;background:linear-gradient(90deg, #0ff 0%, #fff 50%, #f50 100%);width:0%;transition:width 0.1s linear}'+
                    '.sw-zone{position:absolute;top:0;height:100%;border:2px solid #fff;z-index:2;background:rgba(255,100,0,0.3);box-shadow:0 0 10px #f50}'+
                    '.sw-btn{width:100%;background:#220a00;color:'+col+';border:2px solid '+col+';padding:12px;font-weight:bold;font-size:1.1em;cursor:pointer;text-transform:uppercase;touch-action:manipulation}'+
                    '.sw-btn:active{background:'+col+';color:#000}'+
                    '.sw-st{margin-top:15px;text-align:center;font-weight:bold;min-height:20px}';
    el.appendChild(s);

    // HTML
    el.innerHTML += '<div class="sw-box">'+
                    '<div class="sw-tit">NODE · FRAGUA DO VENTO</div>'+
                    '<div class="sw-inf">'+
                        '<b>SISTEMA:</b> TURBINAS EÓLICAS.<br>'+
                        '<b>ALERT:</b> The system is unstable.<br>'+
                        'Configura as válvulas segundo as <b>Rachas e Calmas</b> e mantén a rotación na zona de ignición para prender o Lume.<br>'+
                    '</div>'+
                    '<div id="sw-p" class="sw-pnl"></div>'+
                    '<div class="sw-meter"><div id="bar" class="sw-bar"></div><div class="sw-zone" style="left:70%;width:20%"></div></div>'+
                    '<button id="sw-btn" class="sw-btn">INICIAR TURBINA</button>'+
                    '<div id="sw-st" class="sw-st">ESPERANDO VIENTO...</div></div>';

    // SOLUCIÓN: 1-0-0-1-1 (Racha, Calma, Calma, Racha, Racha)
    var target = [1, 0, 0, 1, 1]; 
    var current = [0, 0, 0, 0, 0];
    
    // Crear 5 Interruptores
    var panel = el.querySelector('#sw-p');
    target.forEach((t, i) => {
        var u = document.createElement('div'); u.className = 'sw-unit';
        u.innerHTML = '<div id="lev-'+i+'" class="sw-lev off"><div class="sw-hnd"></div></div><small style="margin-top:5px;color:#555;font-size:0.7em">V'+(i+1)+'</small>';
        u.querySelector('#lev-'+i).onclick = () => toggle(i);
        panel.appendChild(u);
    });

    function toggle(i) {
        current[i] = current[i] === 1 ? 0 : 1;
        var lev = document.getElementById('lev-'+i);
        if(current[i]===1) lev.className = 'sw-lev on';
        else lev.className = 'sw-lev off';
        document.getElementById('sw-st').innerText = 'VÁLVULA AXUSTADA';
        document.getElementById('sw-st').style.color = windCol;
    }

    // MECÁNICA JODIDA: TURBINA CON INERCIA
    var btn = el.querySelector('#sw-btn');
    var bar = el.querySelector('#bar');
    var st = el.querySelector('#sw-st');
    var rpm = 0;
    var holding = false;
    var loop;
    var stabilityTime = 0; // Tiempo que llevas en la zona verde
    var requiredTime = 100; // ~1.5 segundos a 60fps

    // Loop de física
    loop = setInterval(() => {
        // Si pulsas, sube. Si sueltas, baja. PERO CON RUIDO DE VIENTO.
        var windGust = (Math.random() - 0.5) * 3; // Turbulencia aleatoria
        
        if (holding) {
            // Acelera (más rápido cuanto más pulsas)
            rpm += 1.5 + windGust; 
        } else {
            // Frena (inercia)
            rpm -= 2.0;
        }

        // Límites
        if (rpm < 0) rpm = 0;
        if (rpm > 110) { rpm = 110; fail("¡SOBRE-REVOLUCIÓN!"); }

        // Render Barra
        bar.style.width = Math.min(rpm, 100) + '%';

        // Lógica de Victoria (Estabilizar)
        // Zona segura: 70% a 90%
        if (rpm >= 70 && rpm <= 90) {
            stabilityTime++;
            if (stabilityTime % 10 === 0) {
                st.innerText = "PRENDENDO... " + Math.floor((stabilityTime/requiredTime)*100) + "%";
                st.style.color = "#fff";
                el.querySelector('.sw-zone').style.backgroundColor = "rgba(255,255,255,0.6)";
            }
            if (stabilityTime >= requiredTime) win();
        } else {
            stabilityTime = 0; // Si te sales, pierdes el progreso de ignición
            el.querySelector('.sw-zone').style.backgroundColor = "rgba(255,100,0,0.3)";
            
            if(holding && rpm < 70) {
                st.innerText = "ACELERANDO TURBINA...";
                st.style.color = windCol;
            }
        }

    }, 16); // 60 FPS

    var start = function(e) {
        if(e) e.preventDefault();
        
        // Validar primero
        var ok = true;
        target.forEach((t, i) => { if(t !== current[i]) ok = false; });
        if(!ok) {
            st.innerText = "ERRO: VÁLVULAS MAL PECHADAS";
            st.style.color = "red";
            return;
        }
        holding = true;
    };
    var stop = function(e) { if(e) e.preventDefault(); holding = false; };

    btn.onmousedown = start; btn.onmouseup = stop; btn.onmouseleave = stop;
    btn.ontouchstart = start; btn.ontouchend = stop;

    function fail(msg) {
        holding = false;
        rpm = 0;
        st.innerText = msg;
        st.style.color = "red";
        bar.style.backgroundColor = "red";
        setTimeout(() => { bar.style.backgroundColor = ""; }, 500);
    }

    function win() {
        clearInterval(loop);
        st.innerText = ">> LUME PRENDIDO <<";
        st.style.color = "#ff5500"; // Naranja Fuego
        bar.style.background = "#ff5500";
        el.querySelector('.sw-box').style.borderColor = "#ff5500";
        btn.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 2000);
    }
};

// ==========================================
// JUEGO 4: NODE (SYSTEM SEQUENCE)
// Misión: Secuencia Viento (10011) + Turbina Inestable
// ==========================================
window.initSwitch = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    var col = '#ff5500'; // Naranja/Fuego (La meta es el fuego)
    var windCol = '#00ffff'; // Cian (El origen es el viento)

    // Estilos
    var s = document.createElement('style');
    s.textContent = '.sw-box{background:#110500;border:2px solid '+col+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+col+';user-select:none}'+
                    '.sw-tit{text-align:center;border-bottom:2px solid '+col+';margin-bottom:15px;font-weight:bold;font-size:1.2em;text-transform:uppercase}'+
                    '.sw-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4;border:1px solid #442200;padding:8px;background:#000}'+
                    '.sw-pnl{display:flex;justify-content:center;gap:8px;margin-bottom:20px;background:#050505;padding:12px;border-top:1px solid '+windCol+';border-bottom:1px solid '+windCol+'}'+
                    '.sw-unit{display:flex;flex-direction:column;align-items:center}'+
                    '.sw-lev{width:35px;height:60px;background:#111;border:2px solid #444;position:relative;cursor:pointer}'+
                    '.sw-hnd{width:29px;height:29px;background:#333;position:absolute;left:1px;transition:top 0.1s;box-shadow:inset 0 0 5px #000}'+
                    '.sw-lev.on{background:#002222;border-color:'+windCol+'}'+
                    '.sw-lev.on .sw-hnd{top:3px;background:'+windCol+';box-shadow:0 0 10px '+windCol+'}'+
                    '.sw-lev.off .sw-hnd{top:26px;background:#300}'+
                    '.sw-meter{width:100%;height:30px;background:#111;border:1px solid #555;margin-bottom:10px;position:relative;overflow:hidden}'+
                    '.sw-bar{height:100%;background:linear-gradient(90deg, #0ff 0%, #fff 50%, #f50 100%);width:0%;transition:width 0.1s linear}'+
                    '.sw-zone{position:absolute;top:0;height:100%;border:2px solid #fff;z-index:2;background:rgba(255,100,0,0.3);box-shadow:0 0 10px #f50}'+
                    '.sw-btn{width:100%;background:#220a00;color:'+col+';border:2px solid '+col+';padding:12px;font-weight:bold;font-size:1.1em;cursor:pointer;text-transform:uppercase;touch-action:manipulation}'+
                    '.sw-btn:active{background:'+col+';color:#000}'+
                    '.sw-st{margin-top:15px;text-align:center;font-weight:bold;min-height:20px}';
    el.appendChild(s);

    // HTML
    el.innerHTML += '<div class="sw-box">'+
                    '<div class="sw-tit">NODE · FRAGUA DO VENTO</div>'+
                    '<div class="sw-inf">'+
                        '<b>SISTEMA:</b> TURBINAS EÓLICAS.<br>'+
                        '<b>ALERT:</b> The system is unstable.<br>'+
                        'Configura as válvulas segundo as <b>Rachas e Calmas</b> e mantén a rotación na zona de ignición para prender o Lume.<br>'+
                    '</div>'+
                    '<div id="sw-p" class="sw-pnl"></div>'+
                    '<div class="sw-meter"><div id="bar" class="sw-bar"></div><div class="sw-zone" style="left:70%;width:20%"></div></div>'+
                    '<button id="sw-btn" class="sw-btn">INICIAR TURBINA</button>'+
                    '<div id="sw-st" class="sw-st">ESPERANDO VIENTO...</div></div>';

    // SOLUCIÓN: 1-0-0-1-1 (Racha, Calma, Calma, Racha, Racha)
    var target = [1, 0, 0, 1, 1]; 
    var current = [0, 0, 0, 0, 0];
    
    // Crear 5 Interruptores
    var panel = el.querySelector('#sw-p');
    target.forEach((t, i) => {
        var u = document.createElement('div'); u.className = 'sw-unit';
        u.innerHTML = '<div id="lev-'+i+'" class="sw-lev off"><div class="sw-hnd"></div></div><small style="margin-top:5px;color:#555;font-size:0.7em">V'+(i+1)+'</small>';
        u.querySelector('#lev-'+i).onclick = () => toggle(i);
        panel.appendChild(u);
    });

    function toggle(i) {
        current[i] = current[i] === 1 ? 0 : 1;
        var lev = document.getElementById('lev-'+i);
        if(current[i]===1) lev.className = 'sw-lev on';
        else lev.className = 'sw-lev off';
        document.getElementById('sw-st').innerText = 'VÁLVULA AXUSTADA';
        document.getElementById('sw-st').style.color = windCol;
    }

    // MECÁNICA JODIDA: TURBINA CON INERCIA
    var btn = el.querySelector('#sw-btn');
    var bar = el.querySelector('#bar');
    var st = el.querySelector('#sw-st');
    var rpm = 0;
    var holding = false;
    var loop;
    var stabilityTime = 0; // Tiempo que llevas en la zona verde
    var requiredTime = 100; // ~1.5 segundos a 60fps

    // Loop de física
    loop = setInterval(() => {
        // Si pulsas, sube. Si sueltas, baja. PERO CON RUIDO DE VIENTO.
        var windGust = (Math.random() - 0.5) * 3; // Turbulencia aleatoria
        
        if (holding) {
            // Acelera (más rápido cuanto más pulsas)
            rpm += 1.5 + windGust; 
        } else {
            // Frena (inercia)
            rpm -= 2.0;
        }

        // Límites
        if (rpm < 0) rpm = 0;
        if (rpm > 110) { rpm = 110; fail("¡SOBRE-REVOLUCIÓN!"); }

        // Render Barra
        bar.style.width = Math.min(rpm, 100) + '%';

        // Lógica de Victoria (Estabilizar)
        // Zona segura: 70% a 90%
        if (rpm >= 70 && rpm <= 90) {
            stabilityTime++;
            if (stabilityTime % 10 === 0) {
                st.innerText = "PRENDENDO... " + Math.floor((stabilityTime/requiredTime)*100) + "%";
                st.style.color = "#fff";
                el.querySelector('.sw-zone').style.backgroundColor = "rgba(255,255,255,0.6)";
            }
            if (stabilityTime >= requiredTime) win();
        } else {
            stabilityTime = 0; // Si te sales, pierdes el progreso de ignición
            el.querySelector('.sw-zone').style.backgroundColor = "rgba(255,100,0,0.3)";
            
            if(holding && rpm < 70) {
                st.innerText = "ACELERANDO TURBINA...";
                st.style.color = windCol;
            }
        }

    }, 16); // 60 FPS

    var start = function(e) {
        if(e) e.preventDefault();
        
        // Validar primero
        var ok = true;
        target.forEach((t, i) => { if(t !== current[i]) ok = false; });
        if(!ok) {
            st.innerText = "ERRO: VÁLVULAS MAL PECHADAS";
            st.style.color = "red";
            return;
        }
        holding = true;
    };
    var stop = function(e) { if(e) e.preventDefault(); holding = false; };

    btn.onmousedown = start; btn.onmouseup = stop; btn.onmouseleave = stop;
    btn.ontouchstart = start; btn.ontouchend = stop;

    function fail(msg) {
        holding = false;
        rpm = 0;
        st.innerText = msg;
        st.style.color = "red";
        bar.style.backgroundColor = "red";
        setTimeout(() => { bar.style.backgroundColor = ""; }, 500);
    }

    function win() {
        clearInterval(loop);
        st.innerText = ">> LUME PRENDIDO <<";
        st.style.color = "#ff5500"; // Naranja Fuego
        bar.style.background = "#ff5500";
        el.querySelector('.sw-box').style.borderColor = "#ff5500";
        btn.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 2000);
    }
};

// ==========================================
// JUEGO 4: NODE (SEQUENCE PROTOCOL)
// ==========================================
window.initSwitch = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    
    // ESTÉTICA MILITAR / INDUSTRIAL
    var mainCol = '#ffcc00'; // Amarilla Precaución
    var bgCol = '#111';

    var s = document.createElement('style');
    s.textContent = '.cb-box{background:#0a0a00;border:2px solid '+mainCol+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+mainCol+';position:relative;user-select:none}'+
                    '.cb-tit{text-align:center;border-bottom:2px solid '+mainCol+';margin-bottom:15px;font-weight:bold;font-size:1.2em;letter-spacing:1px}'+
                    '.cb-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4}'+
                    '.cb-data{border:1px dashed '+mainCol+';padding:8px;margin:10px 0;background:#1a1a00;font-size:0.85em;color:#fff}'+
                    '.cb-pnl{display:flex;justify-content:center;gap:5px;margin:20px 0;background:#000;padding:12px;border:1px solid #444}'+
                    '.cb-unit{display:flex;flex-direction:column;align-items:center;width:18%}'+
                    '.cb-sw{width:100%;height:50px;background:#222;border:2px solid #555;position:relative;cursor:pointer}'+
                    '.cb-sw-h{width:100%;height:50%;background:#444;position:absolute;top:50%;transition:all 0.1s}'+
                    '.cb-sw.on{border-color:'+mainCol+'}'+
                    '.cb-sw.on .cb-sw-h{top:0;background:'+mainCol+';box-shadow:0 0 10px '+mainCol+'}'+
                    '.cb-meter-box{position:relative;height:25px;background:#222;border:1px solid #555;margin-bottom:10px}'+
                    '.cb-bar{height:100%;width:0%;background:linear-gradient(90deg, #fc0 0%, #f60 70%, #f00 100%);transition:width 0.05s linear}'+
                    '.cb-limit{position:absolute;top:0;right:10%;width:15%;height:100%;border-left:2px solid #fff;border-right:2px solid #fff;background:rgba(255,0,0,0.3);z-index:2}'+
                    '.cb-btn{width:100%;background:#330000;border:2px solid #ff3300;color:#ff3300;padding:12px;font-weight:bold;font-size:1.1em;cursor:pointer;text-transform:uppercase}'+
                    '.cb-btn:active{background:#ff3300;color:#000}'+
                    '.cb-st{margin-top:10px;text-align:center;font-weight:bold;min-height:20px;font-size:0.9em}'+
                    '@keyframes shake {0%{transform:translate(1px,1px)} 25%{transform:translate(-1px,-2px)} 50%{transform:translate(-3px,0px)} 75%{transform:translate(3px,2px)} 100%{transform:translate(1px,-1px)}}'+
                    '.shaking{animation:shake 0.1s infinite}';
    el.appendChild(s);

    // HTML ESTRUCTURADO COMO FICHA TÉCNICA
    el.innerHTML += '<div class="cb-box" id="main-box">'+
                    '<div class="cb-tit">NODE · IGNITION</div>'+
                    '<div class="cb-inf">'+
                        'A Fragua do sistema está fría. Sen reacción térmica, o Escudo carece de potencia.<br>'+
                        '<div class="cb-data">'+
                            '<b>⚠ DIAGNÓSTICO DE ENXEÑERÍA:</b><br>'+
                            '> ESTADO: NÚCLEO INACTIVO<br>'+
                            '> MESTURA: POBRE (Sen Osíxeno)<br>'+
                            '> PRESIÓN: INSUFICIENTE<br>'+
                            '> OBXECTIVO: TEMP. CRÍTICA (FUSIÓN)'+
                        '</div>'+
                        '<i>"O vento alimenta o lume. Restablece o fluxo de osíxeno e purga o sistema ata o punto de fusión."</i>'+
                    '</div>'+
                    '<div id="pnl" class="cb-pnl"></div>'+
                    '<div class="cb-meter-box"><div id="bar" class="cb-bar"></div><div class="cb-limit"></div></div>'+
                    '<button id="btn" class="cb-btn">PURGAR SISTEMA</button>'+
                    '<div id="st" class="cb-st">ESPERANDO CONFIGURACIÓN...</div></div>';

    // SOLUCIÓN LÓGICA: 1-0-0-1-1 
    // (Explicación: Extremos e Final abertos = Entrada de Aire. Centro pechado = Cámara estanca)
    var target = [1, 0, 0, 1, 1];
    var current = [0, 0, 0, 0, 0];
    
    var panel = el.querySelector('#pnl');
    target.forEach((t, i) => {
        var u = document.createElement('div'); u.className = 'cb-unit';
        u.innerHTML = '<div id="sw-'+i+'" class="cb-sw"><div class="cb-sw-h"></div></div><small style="margin-top:5px;color:#888">V'+(i+1)+'</small>';
        u.querySelector('#sw-'+i).onclick = () => toggle(i);
        panel.appendChild(u);
    });

    function toggle(i) {
        current[i] = current[i] === 1 ? 0 : 1;
        var sw = document.getElementById('sw-'+i);
        if(current[i]===1) sw.className = 'cb-sw on';
        else sw.className = 'cb-sw';
    }

    // MECÁNICA DE CARGA TÉRMICA
    var btn = el.querySelector('#btn');
    var bar = el.querySelector('#bar');
    var st = el.querySelector('#st');
    var box = el.querySelector('#main-box');
    
    var heat = 0;
    var charging = false;
    var loop;

    function start(e) {
        if(e) e.preventDefault();
        
        var ok = true;
        target.forEach((t, i) => { if(t !== current[i]) ok = false; });
        if(!ok) {
            fail("MESTURA INCORRECTA (AFOGADO)");
            return;
        }

        charging = true;
        heat = 0;
        st.innerText = "ELEVANDO TEMPERATURA...";
        st.style.color = "#fff";
        box.classList.add("shaking");
        
        loop = setInterval(() => {
            heat += 2.5; 
            if(heat > 110) { stop(); fail("¡FUSIÓN DO NÚCLEO!"); } 
            else { bar.style.width = Math.min(heat, 100) + '%'; }
        }, 30);
    }

    function stop(e) {
        if(e) e.preventDefault();
        if(!charging) return;
        
        charging = false;
        clearInterval(loop);
        box.classList.remove("shaking");

        // ZONA CRÍTICA: 75% - 90%
        if(heat >= 75 && heat <= 90) {
            win();
        } else if (heat < 75) {
            st.innerText = "TEMP. INSUFICIENTE ("+Math.floor(heat)+"%)";
            st.style.color = "#ff6600";
            resetBar();
        }
    }

    function resetBar() { setTimeout(() => { heat = 0; bar.style.width = '0%'; }, 500); }

    function fail(msg) {
        st.innerText = msg;
        st.style.color = "red";
        bar.style.backgroundColor = "red";
        box.classList.remove("shaking");
        setTimeout(() => { bar.style.backgroundColor = ""; resetBar(); }, 1000);
    }

    function win() {
        st.innerText = ">> IGNICIÓN ESTABLECIDA <<";
        st.style.color = "#0f0";
        bar.style.background = "#0f0";
        el.querySelector('.cb-box').style.borderColor = "#0f0";
        btn.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }

    btn.onmousedown = start; btn.onmouseup = stop; btn.onmouseleave = stop;
    btn.ontouchstart = start; btn.ontouchend = stop;
};

window.initSwitch = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    
    var mainCol = '#ffcc00'; // Amarillo Industrial
    
    // ESTILOS
    var s = document.createElement('style');
    s.textContent = '.cb-box{background:#0a0a00;border:2px solid '+mainCol+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+mainCol+';position:relative;user-select:none}'+
                    '.cb-tit{text-align:center;border-bottom:2px solid '+mainCol+';margin-bottom:15px;font-weight:bold;font-size:1.2em;letter-spacing:1px}'+
                    '.cb-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4}'+
                    '.cb-data{border:1px dashed '+mainCol+';padding:8px;margin:10px 0;background:#1a1a00;font-size:0.85em;color:#fff}'+
                    '.cb-pnl{display:flex;justify-content:center;gap:5px;margin:20px 0;background:#000;padding:12px;border:1px solid #444}'+
                    '.cb-unit{display:flex;flex-direction:column;align-items:center;width:18%}'+
                    '.cb-sw{width:100%;height:50px;background:#222;border:2px solid #555;position:relative;cursor:pointer}'+
                    '.cb-sw-h{width:100%;height:50%;background:#444;position:absolute;top:50%;transition:all 0.1s}'+
                    '.cb-sw.on{border-color:'+mainCol+'}'+
                    '.cb-sw.on .cb-sw-h{top:0;background:'+mainCol+';box-shadow:0 0 10px '+mainCol+'}'+
                    '.cb-meter-box{position:relative;height:25px;background:#222;border:1px solid #555;margin-bottom:10px}'+
                    '.cb-bar{height:100%;width:0%;background:linear-gradient(90deg, #fc0 0%, #f60 70%, #f00 100%);transition:width 0.05s linear}'+
                    '.cb-limit{position:absolute;top:0;right:10%;width:15%;height:100%;border-left:2px solid #fff;border-right:2px solid #fff;background:rgba(255,0,0,0.3);z-index:2}'+
                    '.cb-btn{width:100%;background:#330000;border:2px solid #ff3300;color:#ff3300;padding:12px;font-weight:bold;font-size:1.1em;cursor:pointer;text-transform:uppercase}'+
                    '.cb-btn:active{background:#ff3300;color:#000}'+
                    '.cb-st{margin-top:10px;text-align:center;font-weight:bold;min-height:20px;font-size:0.9em}'+
                    '@keyframes shake {0%{transform:translate(1px,1px)} 25%{transform:translate(-1px,-2px)} 50%{transform:translate(-3px,0px)} 75%{transform:translate(3px,2px)} 100%{transform:translate(1px,-1px)}}'+
                    '.shaking{animation:shake 0.1s infinite}';
    el.appendChild(s);

    // HTML BASADO EN EL TEXTO DEL TRÍPTICO
    el.innerHTML += '<div class="cb-box" id="main-box">'+
                    '<div class="cb-tit">NODE · IGNITION</div>'+
                    '<div class="cb-inf">'+
                        'O vento alimenta o lume. Sen reacción térmica, o Escudo carece de potencia.<br>'+
                        '<div class="cb-data">'+
                            '<b>⚠ SEQUENCE PROTOCOL:</b><br>'+
                            '> ADMISIÓN (EXTERNA): [ABERTA]<br>'+
                            '> CÁMARA (CENTRAL): [PECHADA]<br>'+
                            '> OBXECTIVO: FUSIÓN'+
                        '</div>'+
                        '<i>"Abre os inxectores externos. Mantén o centro pechado. Purga ata a Zona Vermella."</i>'+
                    '</div>'+
                    '<div id="pnl" class="cb-pnl"></div>'+
                    '<div class="cb-meter-box"><div id="bar" class="cb-bar"></div><div class="cb-limit"></div></div>'+
                    '<button id="btn" class="cb-btn">PURGAR SISTEMA</button>'+
                    '<div id="st" class="cb-st">ESPERANDO CONFIGURACIÓN...</div></div>';

    // SOLUCIÓN: 1-1-0-1-1 (Periferia ON, Centro OFF)
    var target = [1, 1, 0, 1, 1];
    var current = [0, 0, 0, 0, 0];
    
    var panel = el.querySelector('#pnl');
    target.forEach((t, i) => {
        var u = document.createElement('div'); u.className = 'cb-unit';
        u.innerHTML = '<div id="sw-'+i+'" class="cb-sw"><div class="cb-sw-h"></div></div><small style="margin-top:5px;color:#888">V'+(i+1)+'</small>';
        u.querySelector('#sw-'+i).onclick = () => toggle(i);
        panel.appendChild(u);
    });

    function toggle(i) {
        current[i] = current[i] === 1 ? 0 : 1;
        var sw = document.getElementById('sw-'+i);
        if(current[i]===1) sw.className = 'cb-sw on';
        else sw.className = 'cb-sw';
    }

    var btn = el.querySelector('#btn');
    var bar = el.querySelector('#bar');
    var st = el.querySelector('#st');
    var box = el.querySelector('#main-box');
    var heat = 0;
    var charging = false;
    var loop;

    function start(e) {
        if(e) e.preventDefault();
        
        var ok = true;
        target.forEach((t, i) => { if(t !== current[i]) ok = false; });
        if(!ok) {
            fail("MESTURA INCORRECTA (AFOGADO)");
            return;
        }

        charging = true;
        heat = 0;
        st.innerText = "ELEVANDO TEMPERATURA...";
        st.style.color = "#fff";
        box.classList.add("shaking");
        
        loop = setInterval(() => {
            heat += 2.5; 
            if(heat > 110) { stop(); fail("¡FUSIÓN DO NÚCLEO!"); } 
            else { bar.style.width = Math.min(heat, 100) + '%'; }
        }, 30);
    }

    function stop(e) {
        if(e) e.preventDefault();
        if(!charging) return;
        
        charging = false;
        clearInterval(loop);
        box.classList.remove("shaking");

        if(heat >= 75 && heat <= 90) {
            win();
        } else if (heat < 75) {
            st.innerText = "TEMP. INSUFICIENTE ("+Math.floor(heat)+"%)";
            st.style.color = "#ff6600";
            resetBar();
        }
    }

    function resetBar() { setTimeout(() => { heat = 0; bar.style.width = '0%'; }, 500); }

    function fail(msg) {
        st.innerText = msg;
        st.style.color = "red";
        bar.style.backgroundColor = "red";
        box.classList.remove("shaking");
        setTimeout(() => { bar.style.backgroundColor = ""; resetBar(); }, 1000);
    }

    function win() {
        st.innerText = ">> IGNICIÓN ESTABLECIDA <<";
        st.style.color = "#0f0";
        bar.style.background = "#0f0";
        el.querySelector('.cb-box').style.borderColor = "#0f0";
        btn.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }

    btn.onmousedown = start; btn.onmouseup = stop; btn.onmouseleave = stop;
    btn.ontouchstart = start; btn.ontouchend = stop;
};

window.initSwitch = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    
    var mainCol = '#ffcc00'; // Amarillo Industrial
    
    // ESTILOS
    var s = document.createElement('style');
    s.textContent = '.cb-box{background:#0a0a00;border:2px solid '+mainCol+';padding:12px;max-width:600px;margin:0 auto;font-family:monospace;color:'+mainCol+';position:relative;user-select:none}'+
                    '.cb-tit{text-align:center;border-bottom:2px solid '+mainCol+';margin-bottom:15px;font-weight:bold;font-size:1.2em;letter-spacing:1px}'+
                    '.cb-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4}'+
                    '.cb-data{border:1px dashed '+mainCol+';padding:8px;margin:10px 0;background:#1a1a00;font-size:0.85em;color:#fff}'+
                    '.cb-pnl{display:flex;justify-content:center;gap:5px;margin:20px 0;background:#000;padding:12px;border:1px solid #444}'+
                    '.cb-unit{display:flex;flex-direction:column;align-items:center;width:18%}'+
                    '.cb-sw{width:100%;height:50px;background:#222;border:2px solid #555;position:relative;cursor:pointer}'+
                    '.cb-sw-h{width:100%;height:50%;background:#444;position:absolute;top:50%;transition:all 0.1s}'+
                    '.cb-sw.on{border-color:'+mainCol+'}'+
                    '.cb-sw.on .cb-sw-h{top:0;background:'+mainCol+';box-shadow:0 0 10px '+mainCol+'}'+
                    '.cb-meter-box{position:relative;height:25px;background:#222;border:1px solid #555;margin-bottom:10px}'+
                    '.cb-bar{height:100%;width:0%;background:linear-gradient(90deg, #fc0 0%, #f60 70%, #f00 100%);transition:width 0.05s linear}'+
                    '.cb-limit{position:absolute;top:0;right:10%;width:15%;height:100%;border-left:2px solid #fff;border-right:2px solid #fff;background:rgba(255,0,0,0.3);z-index:2}'+
                    '.cb-btn{width:100%;background:#330000;border:2px solid #ff3300;color:#ff3300;padding:12px;font-weight:bold;font-size:1.1em;cursor:pointer;text-transform:uppercase}'+
                    '.cb-btn:active{background:#ff3300;color:#000}'+
                    '.cb-st{margin-top:10px;text-align:center;font-weight:bold;min-height:20px;font-size:0.9em}'+
                    '@keyframes shake {0%{transform:translate(1px,1px)} 25%{transform:translate(-1px,-2px)} 50%{transform:translate(-3px,0px)} 75%{transform:translate(3px,2px)} 100%{transform:translate(1px,-1px)}}'+
                    '.shaking{animation:shake 0.1s infinite}';
    el.appendChild(s);

    // HTML BASADO EN EL TEXTO DEL TRÍPTICO
    el.innerHTML += '<div class="cb-box" id="main-box">'+
                    '<div class="cb-tit">NODE · IGNITION</div>'+
                    '<div class="cb-inf">'+
                        'O vento alimenta o lume. Sen reacción térmica, o Escudo carece de potencia.<br>'+
                        '<div class="cb-data">'+
                            '<b>⚠ SEQUENCE PROTOCOL:</b><br>'+
                            '> ADMISIÓN (EXTERNA): [ABERTA]<br>'+
                            '> CÁMARA (CENTRAL): [PECHADA]<br>'+
                            '> OBXECTIVO: FUSIÓN'+
                        '</div>'+
                        '<i>"Abre os inxectores externos. Mantén o centro pechado. Purga ata a Zona Vermella."</i>'+
                    '</div>'+
                    '<div id="pnl" class="cb-pnl"></div>'+
                    '<div class="cb-meter-box"><div id="bar" class="cb-bar"></div><div class="cb-limit"></div></div>'+
                    '<button id="btn" class="cb-btn">PURGAR SISTEMA</button>'+
                    '<div id="st" class="cb-st">ESPERANDO CONFIGURACIÓN...</div></div>';

    // SOLUCIÓN: 1-1-0-1-1 (Periferia ON, Centro OFF)
    var target = [1, 1, 0, 1, 1];
    var current = [0, 0, 0, 0, 0];
    
    var panel = el.querySelector('#pnl');
    target.forEach((t, i) => {
        var u = document.createElement('div'); u.className = 'cb-unit';
        u.innerHTML = '<div id="sw-'+i+'" class="cb-sw"><div class="cb-sw-h"></div></div><small style="margin-top:5px;color:#888">V'+(i+1)+'</small>';
        u.querySelector('#sw-'+i).onclick = () => toggle(i);
        panel.appendChild(u);
    });

    function toggle(i) {
        current[i] = current[i] === 1 ? 0 : 1;
        var sw = document.getElementById('sw-'+i);
        if(current[i]===1) sw.className = 'cb-sw on';
        else sw.className = 'cb-sw';
    }

    var btn = el.querySelector('#btn');
    var bar = el.querySelector('#bar');
    var st = el.querySelector('#st');
    var box = el.querySelector('#main-box');
    var heat = 0;
    var charging = false;
    var loop;

    function start(e) {
        if(e) e.preventDefault();
        
        var ok = true;
        target.forEach((t, i) => { if(t !== current[i]) ok = false; });
        if(!ok) {
            fail("MESTURA INCORRECTA (AFOGADO)");
            return;
        }

        charging = true;
        heat = 0;
        st.innerText = "ELEVANDO TEMPERATURA...";
        st.style.color = "#fff";
        box.classList.add("shaking");
        
        loop = setInterval(() => {
            heat += 2.5; 
            if(heat > 110) { stop(); fail("¡FUSIÓN DO NÚCLEO!"); } 
            else { bar.style.width = Math.min(heat, 100) + '%'; }
        }, 30);
    }

    function stop(e) {
        if(e) e.preventDefault();
        if(!charging) return;
        
        charging = false;
        clearInterval(loop);
        box.classList.remove("shaking");

        if(heat >= 75 && heat <= 90) {
            win();
        } else if (heat < 75) {
            st.innerText = "TEMP. INSUFICIENTE ("+Math.floor(heat)+"%)";
            st.style.color = "#ff6600";
            resetBar();
        }
    }

    function resetBar() { setTimeout(() => { heat = 0; bar.style.width = '0%'; }, 500); }

    function fail(msg) {
        st.innerText = msg;
        st.style.color = "red";
        bar.style.backgroundColor = "red";
        box.classList.remove("shaking");
        setTimeout(() => { bar.style.backgroundColor = ""; resetBar(); }, 1000);
    }

    function win() {
        st.innerText = ">> IGNICIÓN ESTABLECIDA <<";
        st.style.color = "#0f0";
        bar.style.background = "#0f0";
        el.querySelector('.cb-box').style.borderColor = "#0f0";
        btn.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }

    btn.onmousedown = start; btn.onmouseup = stop; btn.onmouseleave = stop;
    btn.ontouchstart = start; btn.ontouchend = stop;
};

window.initSimon = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    
    var mainCol = '#33ff33'; // Verde Datos
    var bgCol = '#001100';

    var s = document.createElement('style');
    s.textContent = '.sm-box{background:'+bgCol+';border:2px solid '+mainCol+';padding:12px;max-width:600px;margin:0 auto;font-family:"Courier New", monospace;color:'+mainCol+';user-select:none}'+
                    '.sm-tit{text-align:center;border-bottom:2px solid '+mainCol+';margin-bottom:15px;font-weight:bold;font-size:1.2em;letter-spacing:1px}'+
                    '.sm-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4;border:1px dashed #005500;padding:8px}'+
                    '.sm-screen{background:#002200;border:1px solid '+mainCol+';padding:8px;text-align:center;margin-bottom:15px;font-weight:bold;min-height:25px;text-transform:uppercase}'+
                    '.sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:20px auto;max-width:300px}'+
                    '.sm-btn{aspect-ratio:1;border:2px solid #005500;border-radius:10px;cursor:pointer;background:#002200;transition:all 0.1s;position:relative;box-shadow:inset 0 0 10px #000}'+
                    '.sm-btn:active{transform:scale(0.95)}'+
                    '.sm-c0.on{background:#ff0055;border-color:#ff0055;box-shadow:0 0 20px #ff0055}'+ 
                    '.sm-c1.on{background:#0055ff;border-color:#0055ff;box-shadow:0 0 20px #0055ff}'+ 
                    '.sm-c2.on{background:#ffff00;border-color:#ffff00;box-shadow:0 0 20px #ffff00}'+ 
                    '.sm-c3.on{background:#00ff55;border-color:#00ff55;box-shadow:0 0 20px #00ff55}'+ 
                    '.sm-st{margin-top:15px;text-align:center;font-weight:bold;height:20px;font-size:1.1em}'+
                    '.sm-start{background:#004400;color:#0f0;border:1px solid #0f0;padding:12px 30px;cursor:pointer;font-weight:bold;font-size:1.1em;text-transform:uppercase}';
    el.appendChild(s);

    el.innerHTML += '<div class="sm-box">'+
                    '<div class="sm-tit">NODE · MEMORY</div>'+
                    '<div class="sm-inf">'+
                        'System memory is fragmented. Restore the correct sequence.<br>'+
                        '<i>"Cando restaures os patróns de luz e o Arquivo recupere a súa integridade… liberarás a quinta Runa."</i>'+
                    '</div>'+
                    '<div id="screen" class="sm-screen">MEMORIA CORRUPTA</div>'+
                    '<div class="sm-grid">'+
                        '<div id="b-0" class="sm-btn sm-c0"></div>'+
                        '<div id="b-1" class="sm-btn sm-c1"></div>'+
                        '<div id="b-2" class="sm-btn sm-c2"></div>'+
                        '<div id="b-3" class="sm-btn sm-c3"></div>'+
                    '</div>'+
                    '<div style="text-align:center"><button id="start-btn" class="sm-start">RECUPERAR DATOS</button></div>'+
                    '</div>';

    var sequence = [];
    var playerIdx = 0;
    var round = 0;
    var maxRounds = 3; 
    var blockInput = true;
    var screen = el.querySelector('#screen');
    var btnStart = el.querySelector('#start-btn');
    
    function flash(id, duration=300) {
        var btn = document.getElementById('b-'+id);
        btn.classList.add('on');
        screen.style.backgroundColor = "#004400";
        setTimeout(() => { 
            btn.classList.remove('on'); 
            screen.style.backgroundColor = "#002200";
        }, duration);
    }

    function playSequence() {
        blockInput = true;
        screen.innerText = "LENDO SECTOR " + (round+1) + "...";
        screen.style.color = mainCol;
        
        var i = 0;
        var interval = setInterval(() => {
            flash(sequence[i]);
            i++;
            if(i >= sequence.length) {
                clearInterval(interval);
                setTimeout(() => {
                    blockInput = false;
                    screen.innerText = ">> REPITE A SECUENCIA <<";
                    screen.style.color = "#fff";
                }, 500);
            }
        }, 800);
    }

    function nextRound() {
        round++;
        if(round > maxRounds) {
            win();
            return;
        }
        playerIdx = 0;
        sequence.push(Math.floor(Math.random() * 4));
        setTimeout(playSequence, 1000);
    }

    function check(id) {
        if(blockInput) return;
        flash(id, 150);
        
        if(id === sequence[playerIdx]) {
            playerIdx++;
            if(playerIdx >= sequence.length) {
                blockInput = true;
                screen.innerText = "DATOS CONFIRMADOS";
                screen.style.color = "#0f0";
                setTimeout(nextRound, 1000);
            }
        } else {
            fail();
        }
    }

    function fail() {
        blockInput = true;
        screen.innerText = "ERRO DE ESCRITURA";
        screen.style.color = "red";
        el.querySelector('.sm-box').style.borderColor = "red";
        setTimeout(() => {
            el.querySelector('.sm-box').style.borderColor = mainCol;
            screen.innerText = "REINICIANDO...";
            screen.style.color = mainCol;
            setTimeout(startGame, 1500);
        }, 1000);
    }

    function win() {
        blockInput = true;
        screen.innerText = ">> MEMORIA RESTAURADA <<";
        screen.style.color = "#0f0";
        el.querySelector('.sm-box').style.borderColor = "#0f0";
        btnStart.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 2000);
    }

    function startGame() {
        sequence = [];
        round = 0;
        sequence.push(Math.floor(Math.random() * 4));
        sequence.push(Math.floor(Math.random() * 4));
        sequence.push(Math.floor(Math.random() * 4));
        btnStart.style.display = 'none';
        nextRound(); 
    }

    btnStart.onclick = startGame;
    [0,1,2,3].forEach(i => { document.getElementById('b-'+i).onclick = () => check(i); });
};

window.initSimon = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    
    var mainCol = '#33ff33'; // Verde Datos
    var bgCol = '#001100';

    // ESTILOS OPTIMIZADOS
    var s = document.createElement('style');
    s.textContent = '.sm-box{background:'+bgCol+';border:2px solid '+mainCol+';padding:12px;max-width:600px;margin:0 auto;font-family:"Courier New", monospace;color:'+mainCol+';user-select:none;touch-action:manipulation}'+
                    '.sm-tit{text-align:center;border-bottom:2px solid '+mainCol+';margin-bottom:15px;font-weight:bold;font-size:1.2em;letter-spacing:1px}'+
                    '.sm-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4;border:1px dashed #005500;padding:8px}'+
                    '.sm-screen{background:#002200;border:1px solid '+mainCol+';padding:8px;text-align:center;margin-bottom:15px;font-weight:bold;min-height:25px;text-transform:uppercase;font-size:1.1em}'+
                    '.sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:20px auto;max-width:320px}'+
                    '.sm-btn{aspect-ratio:1;border:2px solid #005500;border-radius:8px;cursor:pointer;background:#002200;transition:transform 0.05s, background 0.05s;position:relative;box-shadow:inset 0 0 10px #000; -webkit-tap-highlight-color: transparent;}'+
                    '.sm-btn:active{transform:scale(0.92)}'+
                    // Colores brillantes para diferenciar bien a alta velocidad
                    '.sm-c0.on{background:#ff0055;border-color:#ff0055;box-shadow:0 0 30px #ff0055}'+ 
                    '.sm-c1.on{background:#0088ff;border-color:#0088ff;box-shadow:0 0 30px #0088ff}'+ 
                    '.sm-c2.on{background:#ffff00;border-color:#ffff00;box-shadow:0 0 30px #ffff00}'+ 
                    '.sm-c3.on{background:#00ff00;border-color:#00ff00;box-shadow:0 0 30px #00ff00}'+ 
                    '.sm-start{background:#004400;color:#0f0;border:1px solid #0f0;padding:12px 30px;cursor:pointer;font-weight:bold;font-size:1.1em;text-transform:uppercase}';
    el.appendChild(s);

    el.innerHTML += '<div class="sm-box">'+
                    '<div class="sm-tit">NODE · MEMORY</div>'+
                    '<div class="sm-inf">'+
                        'System memory is fragmented. Restore the correct sequence.<br>'+
                        '<i>"Cando restaures os patróns de luz e o Arquivo recupere a súa integridade… liberarás a quinta Runa."</i>'+
                    '</div>'+
                    '<div id="screen" class="sm-screen">MEMORIA CORRUPTA</div>'+
                    '<div class="sm-grid">'+
                        '<div id="b-0" class="sm-btn sm-c0"></div>'+
                        '<div id="b-1" class="sm-btn sm-c1"></div>'+
                        '<div id="b-2" class="sm-btn sm-c2"></div>'+
                        '<div id="b-3" class="sm-btn sm-c3"></div>'+
                    '</div>'+
                    '<div style="text-align:center"><button id="start-btn" class="sm-start">RECUPERAR DATOS</button></div>'+
                    '</div>';

    var sequence = [];
    var playerIdx = 0;
    var round = 0;
    var maxRounds = 5; // AUMENTADO A 5 RONDAS
    var blockInput = true;
    var screen = el.querySelector('#screen');
    var btnStart = el.querySelector('#start-btn');
    
    function flash(id, duration) {
        var btn = document.getElementById('b-'+id);
        btn.classList.add('on');
        // Sonido visual
        screen.style.border = "1px solid #fff";
        setTimeout(() => { 
            btn.classList.remove('on'); 
            screen.style.border = "1px solid " + mainCol;
        }, duration);
    }

    function playSequence() {
        blockInput = true;
        // CALCULAR VELOCIDAD SEGÚN RONDA (Más difícil cada vez)
        // Ronda 0: 600ms (Lento)
        // Ronda 4: 250ms (Muy rápido)
        var speed = Math.max(250, 650 - (round * 100));
        var flashTime = speed * 0.6; // El flash dura el 60% del ciclo
        
        screen.innerText = "SECUENCIA " + (round+1) + "/" + maxRounds;
        screen.style.color = mainCol;
        
        var i = 0;
        var interval = setInterval(() => {
            flash(sequence[i], flashTime);
            i++;
            if(i >= sequence.length) {
                clearInterval(interval);
                setTimeout(() => {
                    blockInput = false;
                    screen.innerText = ">> TU QUENDA <<";
                    screen.style.color = "#fff";
                }, 500);
            }
        }, speed);
    }

    function nextRound() {
        round++;
        if(round > maxRounds) {
            win();
            return;
        }
        playerIdx = 0;
        sequence.push(Math.floor(Math.random() * 4));
        setTimeout(playSequence, 800);
    }

    function check(id) {
        if(blockInput) return;
        flash(id, 100); // Feedback instantáneo al pulsar
        
        if(id === sequence[playerIdx]) {
            playerIdx++;
            if(playerIdx >= sequence.length) {
                blockInput = true;
                screen.innerText = "OK";
                screen.style.color = "#0f0";
                setTimeout(nextRound, 800);
            }
        } else {
            fail();
        }
    }

    function fail() {
        blockInput = true;
        screen.innerText = "ERRO DE DATOS";
        screen.style.color = "red";
        el.querySelector('.sm-box').style.borderColor = "red";
        
        // Vibración visual
        var b = el.querySelector('.sm-box');
        b.style.transform = "translateX(5px)";
        setTimeout(() => b.style.transform = "translateX(-5px)", 50);
        setTimeout(() => b.style.transform = "translateX(0)", 100);

        setTimeout(() => {
            el.querySelector('.sm-box').style.borderColor = mainCol;
            screen.innerText = "REINICIANDO...";
            screen.style.color = mainCol;
            setTimeout(startGame, 1000); // Reinicio rápido
        }, 1000);
    }

    function win() {
        blockInput = true;
        screen.innerText = ">> INTEGRIDAD 100% <<";
        screen.style.color = "#0f0";
        el.querySelector('.sm-box').style.borderColor = "#0f0";
        btnStart.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }

    function startGame() {
        sequence = [];
        round = 0;
        // DIFICULTAD ALTA: EMPEZAMOS CON 4 PASOS DE GOLPE
        sequence.push(Math.floor(Math.random() * 4));
        sequence.push(Math.floor(Math.random() * 4));
        sequence.push(Math.floor(Math.random() * 4));
        sequence.push(Math.floor(Math.random() * 4));
        
        btnStart.style.display = 'none';
        nextRound(); 
    }

    btnStart.onclick = startGame;
    // Soporte táctil mejorado
    [0,1,2,3].forEach(i => { 
        var b = document.getElementById('b-'+i);
        b.onmousedown = function(e){ e.preventDefault(); check(i); };
        b.ontouchstart = function(e){ e.preventDefault(); check(i); };
    });
};

window.initSimon = function(c, cfg) {
    var el = (typeof c === 'string' ? document.getElementById(c) : c);
    if (!el) return;
    el.innerHTML = '';
    
    var mainCol = '#33ff33';
    var bgCol = '#001100';

    var s = document.createElement('style');
    s.textContent = '.sm-box{background:'+bgCol+';border:2px solid '+mainCol+';padding:12px;max-width:600px;margin:0 auto;font-family:"Courier New", monospace;color:'+mainCol+';user-select:none;touch-action:manipulation}'+
                    '.sm-tit{text-align:center;border-bottom:2px solid '+mainCol+';margin-bottom:15px;font-weight:bold;font-size:1.2em;letter-spacing:1px}'+
                    '.sm-inf{font-size:0.9em;margin-bottom:15px;color:#fff;text-align:left;line-height:1.4;border:1px dashed #005500;padding:8px}'+
                    '.sm-screen{background:#002200;border:1px solid '+mainCol+';padding:8px;text-align:center;margin-bottom:15px;font-weight:bold;min-height:25px;text-transform:uppercase;font-size:1.1em}'+
                    '.sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:20px auto;max-width:320px}'+
                    '.sm-btn{aspect-ratio:1;border:2px solid #005500;border-radius:8px;cursor:pointer;background:#002200;transition:transform 0.05s, background 0.05s;position:relative;box-shadow:inset 0 0 10px #000; -webkit-tap-highlight-color: transparent;}'+
                    '.sm-btn:active{transform:scale(0.92)}'+
                    '.sm-c0.on{background:#ff0055;border-color:#ff0055;box-shadow:0 0 30px #ff0055}'+ 
                    '.sm-c1.on{background:#0088ff;border-color:#0088ff;box-shadow:0 0 30px #0088ff}'+ 
                    '.sm-c2.on{background:#ffff00;border-color:#ffff00;box-shadow:0 0 30px #ffff00}'+ 
                    '.sm-c3.on{background:#00ff00;border-color:#00ff00;box-shadow:0 0 30px #00ff00}'+ 
                    '.sm-start{background:#004400;color:#0f0;border:1px solid #0f0;padding:12px 30px;cursor:pointer;font-weight:bold;font-size:1.1em;text-transform:uppercase}';
    el.appendChild(s);

    el.innerHTML += '<div class="sm-box">'+
                    '<div class="sm-tit">NODE · MEMORY</div>'+
                    '<div class="sm-inf">'+
                        'System memory is fragmented. Restore the correct sequence.<br>'+
                        '<i>"Cando restaures os patróns de luz e o Arquivo recupere a súa integridade… liberarás a quinta Runa."</i>'+
                    '</div>'+
                    '<div id="screen" class="sm-screen">MEMORIA CORRUPTA</div>'+
                    '<div class="sm-grid">'+
                        '<div id="b-0" class="sm-btn sm-c0"></div>'+
                        '<div id="b-1" class="sm-btn sm-c1"></div>'+
                        '<div id="b-2" class="sm-btn sm-c2"></div>'+
                        '<div id="b-3" class="sm-btn sm-c3"></div>'+
                    '</div>'+
                    '<div style="text-align:center"><button id="start-btn" class="sm-start">RECUPERAR DATOS</button></div>'+
                    '</div>';

    var sequence = [];
    var playerIdx = 0;
    var round = 0;
    var maxRounds = 5; 
    var blockInput = true;
    var screen = el.querySelector('#screen');
    var btnStart = el.querySelector('#start-btn');
    
    function flash(id, duration) {
        var btn = document.getElementById('b-'+id);
        btn.classList.add('on');
        screen.style.border = "1px solid #fff";
        setTimeout(() => { 
            btn.classList.remove('on'); 
            screen.style.border = "1px solid " + mainCol;
        }, duration);
    }

    function playSequence() {
        blockInput = true;
        
        // VELOCIDAD: Empieza en 600ms y baja hasta 200ms en la última ronda
        var speed = Math.max(200, 700 - (round * 100));
        var flashTime = speed * 0.6;
        
        // CORRECCIÓN: Ahora muestra el round actual correctamente
        screen.innerText = "SECUENCIA " + round + "/" + maxRounds;
        screen.style.color = mainCol;
        
        var i = 0;
        var interval = setInterval(() => {
            flash(sequence[i], flashTime);
            i++;
            if(i >= sequence.length) {
                clearInterval(interval);
                setTimeout(() => {
                    blockInput = false;
                    screen.innerText = ">> TU QUENDA <<";
                    screen.style.color = "#fff";
                }, 500);
            }
        }, speed);
    }

    function nextRound() {
        round++;
        if(round > maxRounds) {
            win();
            return;
        }
        playerIdx = 0;
        sequence.push(Math.floor(Math.random() * 4));
        setTimeout(playSequence, 800);
    }

    function check(id) {
        if(blockInput) return;
        flash(id, 100);
        
        if(id === sequence[playerIdx]) {
            playerIdx++;
            if(playerIdx >= sequence.length) {
                blockInput = true;
                screen.innerText = "OK";
                screen.style.color = "#0f0";
                setTimeout(nextRound, 800);
            }
        } else {
            fail();
        }
    }

    function fail() {
        blockInput = true;
        screen.innerText = "ERRO DE DATOS";
        screen.style.color = "red";
        el.querySelector('.sm-box').style.borderColor = "red";
        
        var b = el.querySelector('.sm-box');
        b.style.transform = "translateX(5px)";
        setTimeout(() => b.style.transform = "translateX(-5px)", 50);
        setTimeout(() => b.style.transform = "translateX(0)", 100);

        setTimeout(() => {
            el.querySelector('.sm-box').style.borderColor = mainCol;
            screen.innerText = "REINICIANDO...";
            screen.style.color = mainCol;
            setTimeout(startGame, 1000);
        }, 1000);
    }

    function win() {
        blockInput = true;
        screen.innerText = ">> INTEGRIDAD 100% <<";
        screen.style.color = "#0f0";
        el.querySelector('.sm-box').style.borderColor = "#0f0";
        btnStart.style.display = 'none';
        setTimeout(() => { if(window.winGame) window.winGame(); }, 1500);
    }

    function startGame() {
        sequence = [];
        round = 0; // Reiniciamos a 0
        // DIFICULTAD: Empezamos ya con 3 pasos en memoria
        sequence.push(Math.floor(Math.random() * 4));
        sequence.push(Math.floor(Math.random() * 4));
        sequence.push(Math.floor(Math.random() * 4));
        
        btnStart.style.display = 'none';
        // nextRound sumará +1 al round (siendo 1) y añadirá el 4º paso.
        nextRound(); 
    }

    btnStart.onclick = startGame;
    [0,1,2,3].forEach(i => { 
        var b = document.getElementById('b-'+i);
        b.onmousedown = function(e){ e.preventDefault(); check(i); };
        b.ontouchstart = function(e){ e.preventDefault(); check(i); };
    });
};
