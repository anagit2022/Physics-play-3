let port;
let writer;
let stopProgram = false;

const consoleDiv = document.getElementById("console");
const motionPreview = document.getElementById("motionPreview");
const connectStatus = document.getElementById("connectStatus");
const playButton = document.getElementById("playButton");
const slidersContainer = document.getElementById("slidersContainer");

// ---------------- Dynamic sliders ----------------
// Each slider has its own "token" — whatever you type in that little box
// next to the title is exactly what you write in curly braces in Motion,
// e.g. token "Y" -> use {Y} in the Motion box. No hidden parsing/guessing:
// what you see in the token box is what gets matched, always.
let sliders = [
    { id: "amp",   title: "Amplitude", token: "Y",      hint: "By how much dist is the bed pushed?",     min: 0,   max: 50,   step: 1,   value: 5 },
    { id: "speed", title: "Speed",     token: "F",       hint: "How fast is the position changed?",       min: 100, max: 6000, step: 100, value: 3000 },
    { id: "freq",  title: "Frequency", token: "REPEAT",  hint: "How many times to repeat the motion",     min: 1,   max: 100,  step: 1,   value: 5 },
];
let sliderSeq = sliders.length;

function escapeAttr(str){
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderAllSliders(){
    slidersContainer.innerHTML = "";
    sliders.forEach(renderSliderPanel);
}

function renderSliderPanel(def){
    const panel = document.createElement("div");
    panel.className = "panel slider-panel";
    panel.dataset.id = def.id;

    panel.innerHTML = `
        <div class="panel-header">
            <input type="text" class="slider-title-input" value="${escapeAttr(def.title)}">
            <div class="value-box">
                <input type="text" class="slider-token-input" maxlength="10" value="${escapeAttr(def.token)}">
                <input type="number" class="slider-value-input" value="${def.value}" min="${def.min}" max="${def.max}" step="${def.step}">
            </div>
            <button type="button" class="delete-slider-btn" title="Delete this slider">&times;</button>
        </div>
        <input type="text" class="slider-hint-input" value="${escapeAttr(def.hint)}">
        <input type="range" class="slider-range" min="${def.min}" max="${def.max}" step="${def.step}" value="${def.value}">
        <div class="slider-minmax-row">
            <label>Min <input type="number" class="slider-min-input" value="${def.min}"></label>
            <label>Max <input type="number" class="slider-max-input" value="${def.max}"></label>
            <label>Step <input type="number" class="slider-step-input" value="${def.step}"></label>
        </div>
        <div class="slider-buttons">
            <button type="button" class="step-btn" data-dir="-1">&minus;</button>
            <button type="button" class="step-btn" data-dir="1">+</button>
        </div>
    `;

    slidersContainer.appendChild(panel);
    bindSliderPanel(panel, def);
}

function bindSliderPanel(panel, def){
    const titleInput = panel.querySelector(".slider-title-input");
    const tokenInput = panel.querySelector(".slider-token-input");
    const valueInput = panel.querySelector(".slider-value-input");
    const hintInput = panel.querySelector(".slider-hint-input");
    const range = panel.querySelector(".slider-range");
    const minInput = panel.querySelector(".slider-min-input");
    const maxInput = panel.querySelector(".slider-max-input");
    const stepInput = panel.querySelector(".slider-step-input");
    const deleteBtn = panel.querySelector(".delete-slider-btn");

    titleInput.addEventListener("input", () => {
        def.title = titleInput.value;
    });

    tokenInput.addEventListener("input", () => {
        def.token = tokenInput.value.trim();
        updateMotionPreview();
    });

    hintInput.addEventListener("input", () => {
        def.hint = hintInput.value;
    });

    function setValue(v){
        v = Math.min(def.max, Math.max(def.min, v));
        def.value = v;
        valueInput.value = v;
        range.value = v;
        updateMotionPreview();
    }

    valueInput.addEventListener("input", () => {
        const v = Number(valueInput.value);
        if(!isNaN(v)) setValue(v);
    });

    range.addEventListener("input", () => {
        setValue(Number(range.value));
    });

    panel.querySelectorAll(".step-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const dir = Number(btn.dataset.dir);
            setValue(def.value + dir * def.step);
        });
    });

    function applyBounds(){
        range.min = def.min;
        range.max = def.max;
        range.step = def.step;
        valueInput.min = def.min;
        valueInput.max = def.max;
        valueInput.step = def.step;
        setValue(def.value); // re-clamp to new bounds
    }

    minInput.addEventListener("input", () => {
        const v = Number(minInput.value);
        if(!isNaN(v)){ def.min = v; applyBounds(); }
    });
    maxInput.addEventListener("input", () => {
        const v = Number(maxInput.value);
        if(!isNaN(v)){ def.max = v; applyBounds(); }
    });
    stepInput.addEventListener("input", () => {
        const v = Number(stepInput.value);
        if(!isNaN(v) && v > 0){ def.step = v; applyBounds(); }
    });

    deleteBtn.addEventListener("click", () => {
        sliders = sliders.filter(s => s !== def);
        panel.remove();
        updateMotionPreview();
    });
}

document.getElementById("addSliderButton").addEventListener("click", () => {
    sliderSeq++;
    const def = {
        id: "custom" + sliderSeq,
        title: "New slider",
        token: "P" + sliderSeq,
        hint: "Custom parameter",
        min: 0, max: 100, step: 1, value: 0
    };
    sliders.push(def);
    renderSliderPanel(def);
});

renderAllSliders();

// ---- pulls out amp/speed/repeat for things that still expect them
// (e.g. the Observation cards "fill from sliders" button) ----
function getValues(){
    const find = id => sliders.find(s => s.id === id);
    const amp = find("amp");
    const speed = find("speed");
    const repeat = find("freq");
    return {
        amp: amp ? amp.value : undefined,
        speed: speed ? speed.value : undefined,
        repeat: repeat ? repeat.value : undefined,
    };
}

// reads the Motion textarea and fills in every slider's {TOKEN} with its
// current value. Also supports simple offsets like {Y+10} or {F-500}.
function buildMotionLines(){
    const template = document.getElementById("motionInput").value.split("\n");
    return template
        .map(line => line.trim())
        .filter(line => line !== "")
        .map(line => line.replace(/\{([^{}+\-]+)([+\-]\d+(?:\.\d+)?)?\}/g, (match, tokenName, offset) => {
            const def = sliders.find(s => s.token === tokenName);
            if(!def) return match; // no matching slider — leave as-is so the warning below can flag it
            let value = def.value;
            if(offset) value += parseFloat(offset);
            return value;
        }));
}

function updateMotionPreview(){
    const rawTemplate = document.getElementById("motionInput").value;
    const preview = buildMotionLines().join("\n");

    // flag any {token} or {token+N}/{token-N} in the text that doesn't
    // match a current slider, so a rename/typo is obvious instead of
    // silently doing nothing
    const tokenMatches = [...rawTemplate.matchAll(/\{([^{}+\-]+)(?:[+\-]\d+(?:\.\d+)?)?\}/g)];
    const knownTokenNames = sliders.map(s => s.token);
    const unmatched = [...new Set(
        tokenMatches.filter(m => !knownTokenNames.includes(m[1])).map(m => m[0])
    )];

    if(unmatched.length > 0){
        motionPreview.innerHTML =
            `<span style="color:#c62828;">&#9888;&#65039; No slider matches ${unmatched.join(", ")} — check the token box on each slider.</span><br><br>${preview}`;
    }else{
        motionPreview.textContent = preview;
    }
}
document.getElementById("motionInput").addEventListener("input", updateMotionPreview);
updateMotionPreview();

// ---------------- WebSerial ----------------
document.getElementById("connectButton").addEventListener("click", connectPrinter);

async function connectPrinter(){
    try{
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        writer = port.writable.getWriter();
        connectStatus.textContent = "Connected";
        logLine("Connected!");
        readLoop(); // start listening for the printer's "ok" responses
    }catch(err){
        connectStatus.textContent = "Connection failed";
        logLine("Error: " + err.message);
    }
}

// ---- reading responses back from the printer ----
let lineBuffer = "";
let pendingOkResolve = null;

async function readLoop(){
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable); // don't await, runs for life of connection
    const reader = decoder.readable.getReader();
    try{
        while(true){
            const { value, done } = await reader.read();
            if(done) break;
            if(value){
                lineBuffer += value;
                const lines = lineBuffer.split("\n");
                lineBuffer = lines.pop(); // last chunk may be incomplete, keep for next read
                for(let line of lines){
                    line = line.trim();
                    if(line === "") continue;
                    logLine("&lt; " + line);
                    if(line.toLowerCase().includes("ok") && pendingOkResolve){
                        pendingOkResolve();
                        pendingOkResolve = null;
                    }
                }
            }
        }
    }catch(err){
        logLine("Read error: " + err.message);
    }
}

// waits for the next "ok", but gives up after timeoutMs so a dropped
// response can't hang the whole experiment forever
function waitForOk(timeoutMs = 5000){
    return new Promise(resolve => {
        let settled = false;
        pendingOkResolve = () => {
            if(settled) return;
            settled = true;
            resolve();
        };
        setTimeout(() => {
            if(settled) return;
            settled = true;
            pendingOkResolve = null;
            logLine("(no ok received, continuing anyway)");
            resolve();
        }, timeoutMs);
    });
}

async function sendGcode(command){
    if(!writer){
        logLine("Not connected - command not sent: " + command);
        return;
    }
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(command + "\n"));
    logLine("&gt; " + command);
    await waitForOk();
}

function logLine(text){
    consoleDiv.innerHTML += text + "<br>";
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

// ---------------- Play experiment ----------------
document.getElementById("playButton").addEventListener("click", playExperiment);
document.getElementById("stopButton").addEventListener("click", () => {
    stopProgram = true;
    logLine("Stopping experiment...");
});

async function playExperiment(){
    stopProgram = false;
    playButton.disabled = true;

    // ---- Setup commands, sent once ----
    const setupCommands = document.getElementById("setupInput").value.split("\n");
    for(let command of setupCommands){
        if(stopProgram) break;
        command = command.trim();
        if(command !== "") await sendGcode(command);
    }

    // ---- Motion loop: runs until Stop is pressed ----
    // buildMotionLines() re-reads the Motion textarea and every slider's
    // current value every pass, so editing the template or dragging a
    // slider takes effect on the next cycle.
    while(!stopProgram){
        const lines = buildMotionLines();
        for(let line of lines){
            if(stopProgram) break;
            await sendGcode(line);
        }
    }

    logLine("Experiment stopped");
    playButton.disabled = false;
}
