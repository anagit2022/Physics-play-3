let cardCount = 0;
const cardsContainer = document.getElementById("cardsContainer");

// ---- remember the Gemini key across reloads (this browser only) ----
const geminiKeyInput = document.getElementById("geminiKey");
const savedKey = localStorage.getItem("geminiApiKey");
if(savedKey) geminiKeyInput.value = savedKey;
geminiKeyInput.addEventListener("input", () => {
    localStorage.setItem("geminiApiKey", geminiKeyInput.value);
});

document.getElementById("addCardButton").addEventListener("click", createObservationCard);

// start with one card ready to go
createObservationCard();

function createObservationCard(){
    cardCount++;

    const card = document.createElement("div");
    card.className = "obs-card";
    card.dataset.id = cardCount;

    card.innerHTML = `
        <div class="obs-card-header">
            <span class="obs-card-title">New observation</span>
            <div class="obs-card-actions">
                <button type="button" class="delete-btn" title="Delete card">&#128465;</button>
                <button type="button" class="toggle-btn" title="Expand/collapse">&#8964;</button>
            </div>
        </div>

        <div class="obs-card-body">
            <div class="obs-video-wrap">
                <video class="obs-video" autoplay muted playsinline></video>
                <button class="record-btn" title="Start/stop recording"></button>
                <div class="record-timer" style="display:none;">00:00</div>
            </div>

            <div class="obs-field">
                <label>Case</label>
                <input type="text" class="case-input" placeholder="e.g. Swaying of flower stem (Resonance)">
            </div>

            <table class="obs-table">
                <thead>
                    <tr class="obs-thead-row"><th></th><th></th></tr>
                </thead>
                <tbody></tbody>
            </table>
            <div class="obs-table-controls">
                <button type="button" class="add-row-btn">+ Parameter</button>
                <button type="button" class="add-col-btn">+ Trial</button>
                <button type="button" class="remove-col-btn">&minus; Trial</button>
            </div>
            <button type="button" class="fill-btn">Fill from current sliders</button>

            <div class="obs-field">
                <label>Insight</label>
                <div class="insight-wrap">
                    <textarea class="insight-input" rows="3" placeholder="Write your own insight here — or use Help for AI assistance (optional)"></textarea>
                    <div class="help-dropdown">
                        <button type="button" class="help-btn">Help &#9662;</button>
                        <div class="help-menu">
                            <button type="button" class="help-menu-item" data-mode="graphical">Graphical insight</button>
                            <button type="button" class="help-menu-item" data-mode="theoretical">Theoretical insight</button>
                            <button type="button" class="help-menu-item" data-mode="formula">Generalized formula</button>
                            <button type="button" class="help-menu-item" data-mode="simple">Simple insight</button>
                        </div>
                    </div>
                </div>
            </div>

            <button type="button" class="save-obs-btn">Save observation</button>
        </div>
    `;

    cardsContainer.appendChild(card);
    setupCard(card);
}

function setupCard(card){
    const video = card.querySelector(".obs-video");
    const videoWrap = card.querySelector(".obs-video-wrap");
    const recordBtn = card.querySelector(".record-btn");
    const timerEl = card.querySelector(".record-timer");
    const titleEl = card.querySelector(".obs-card-title");
    const caseInput = card.querySelector(".case-input");
    const toggleBtn = card.querySelector(".toggle-btn");
    const deleteBtn = card.querySelector(".delete-btn");
    const header = card.querySelector(".obs-card-header");

    let stream = null;
    let mediaRecorder = null;
    let chunks = [];
    let recording = false;
    let timerInterval = null;
    let seconds = 0;
    let recordedUrl = null;

    // ---- build the default parameter table (rows/columns are editable from here on) ----
    initializeTable(card);
    card.querySelector(".add-row-btn").addEventListener("click", () => addRow(card));
    card.querySelector(".add-col-btn").addEventListener("click", () => addColumn(card));
    card.querySelector(".remove-col-btn").addEventListener("click", () => removeColumn(card));

    // ---- collapse / expand ----
    function setCollapsed(collapsed){
        card.classList.toggle("collapsed", collapsed);
    }
    header.addEventListener("click", (e) => {
        if(e.target.closest(".delete-btn")) return;
        setCollapsed(!card.classList.contains("collapsed"));
    });
    toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setCollapsed(!card.classList.contains("collapsed"));
    });

    // ---- keep the collapsed-row title in sync with the Case field ----
    caseInput.addEventListener("input", () => {
        titleEl.textContent = caseInput.value.trim() || "New observation";
    });

    // ---- delete this card ----
    deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if(recording && mediaRecorder){
            mediaRecorder.stop();
        }
        if(stream){
            stream.getTracks().forEach(t => t.stop());
        }
        if(recordedUrl){
            URL.revokeObjectURL(recordedUrl);
        }
        clearInterval(timerInterval);
        card.remove();
    });

    // ---- open the camera as soon as the card is created ----
    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: true
        }).then(s => {
            stream = s;
            video.srcObject = stream;
        }).catch(err => {
            videoWrap.innerHTML = `<div class="camera-error">Camera unavailable: ${err.message}<br>(needs HTTPS or localhost, and camera permission)</div>`;
        });
    }else{
        videoWrap.innerHTML = `<div class="camera-error">This browser doesn't support camera recording.</div>`;
    }

    // ---- record / stop ----
    recordBtn.addEventListener("click", () => {
        if(!stream) return;

        if(!recording){
            chunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => {
                if(e.data && e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: "video/webm" });
                recordedUrl = URL.createObjectURL(blob);
                video.srcObject = null;
                video.src = recordedUrl;
                video.muted = false;
                video.controls = true;
            };
            mediaRecorder.start();
            recording = true;
            recordBtn.classList.add("recording");

            seconds = 0;
            timerEl.style.display = "block";
            timerEl.textContent = "00:00";
            timerInterval = setInterval(() => {
                seconds++;
                const m = String(Math.floor(seconds / 60)).padStart(2, "0");
                const s = String(seconds % 60).padStart(2, "0");
                timerEl.textContent = `${m}:${s}`;
            }, 1000);
        }else{
            mediaRecorder.stop();
            stream.getTracks().forEach(t => t.stop());
            recording = false;
            recordBtn.classList.remove("recording");
            clearInterval(timerInterval);
            timerEl.style.display = "none";
        }
    });

    // ---- pull current Amplitude/Speed slider values into the table ----
    card.querySelector(".fill-btn").addEventListener("click", () => {
        if(typeof getValues !== "function") return;
        const { amp, speed } = getValues();
        const ampBox = card.querySelector(".amp-fill");
        const speedBox = card.querySelector(".speed-fill");
        if(ampBox && amp !== undefined) ampBox.value = amp;
        if(speedBox && speed !== undefined) speedBox.value = speed;
    });

    // ---- help dropdown: pick what kind of AI assistance you want ----
    const helpDropdown = card.querySelector(".help-dropdown");
    const helpMenu = card.querySelector(".help-menu");
    const helpToggleBtn = card.querySelector(".help-btn");

    helpToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        helpMenu.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
        if(!helpDropdown.contains(e.target)) helpMenu.classList.remove("open");
    });
    card.querySelectorAll(".help-menu-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            helpMenu.classList.remove("open");
            askGeminiForInsight(card, item.dataset.mode);
        });
    });

    // ---- save: lock the card, collapse it, offer the recording for download ----
    card.querySelector(".save-obs-btn").addEventListener("click", () => {
        card.querySelectorAll("input, textarea").forEach(el => el.setAttribute("readonly", true));

        const saveBtn = card.querySelector(".save-obs-btn");
        saveBtn.textContent = "Saved \u2713";
        saveBtn.disabled = true;

        card.querySelector(".fill-btn").disabled = true;
        card.classList.add("saved");

        if(recording){
            mediaRecorder.stop();
            stream.getTracks().forEach(t => t.stop());
            recording = false;
            clearInterval(timerInterval);
        }

        if(recordedUrl){
            const dl = document.createElement("a");
            dl.href = recordedUrl;
            dl.download = `observation_${card.dataset.id}.webm`;
            dl.textContent = "Download video";
            dl.className = "download-link";
            card.querySelector(".obs-card-body").appendChild(dl);
        }

        setCollapsed(true);
    });
}

// ---- sets up the default parameters/columns for a fresh card ----
function initializeTable(card){
    card.dataset.columns = "0";
    card.querySelector(".obs-thead-row").innerHTML = "<th></th><th></th>";
    card.querySelector(".obs-table tbody").innerHTML = "";

    for(let i = 0; i < 3; i++) addColumn(card);

    addRow(card, "Length of stem");
    addRow(card, "Flower size");
    addRow(card, "Head weight");
    addRow(card, "Y distance pushed", "amp-fill");
    addRow(card, "Speed of motion", "speed-fill");
}

// ---- adds one parameter row; fillClass (optional) marks its first cell so
// "Fill from current sliders" can find it ----
function addRow(card, label = "New parameter", fillClass = null){
    const tbody = card.querySelector(".obs-table tbody");
    const columnCount = Number(card.dataset.columns);
    const tr = document.createElement("tr");

    const labelTd = document.createElement("td");
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "param-label";
    labelInput.value = label;
    labelTd.appendChild(labelInput);
    tr.appendChild(labelTd);

    for(let i = 0; i < columnCount; i++){
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "text";
        if(i === 0 && fillClass) input.classList.add(fillClass);
        td.appendChild(input);
        tr.appendChild(td);
    }

    const actionTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-row-btn";
    removeBtn.title = "Remove this parameter";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => tr.remove());
    actionTd.appendChild(removeBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
}

// ---- adds one trial column across the header and every existing row ----
function addColumn(card){
    const columnCount = Number(card.dataset.columns) + 1;
    card.dataset.columns = columnCount;

    const headRow = card.querySelector(".obs-thead-row");
    const th = document.createElement("th");
    th.textContent = `Trial ${columnCount}`;
    headRow.insertBefore(th, headRow.lastElementChild);

    card.querySelectorAll(".obs-table tbody tr").forEach(tr => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "text";
        td.appendChild(input);
        tr.insertBefore(td, tr.lastElementChild);
    });
}

// ---- removes the last trial column (keeps at least one) ----
function removeColumn(card){
    let columnCount = Number(card.dataset.columns);
    if(columnCount <= 1) return;
    columnCount -= 1;
    card.dataset.columns = columnCount;

    const ths = card.querySelectorAll(".obs-thead-row th");
    const lastTrialTh = ths[ths.length - 2];
    if(lastTrialTh) lastTrialTh.remove();

    card.querySelectorAll(".obs-table tbody tr").forEach(tr => {
        const tds = tr.querySelectorAll("td");
        const lastValueTd = tds[tds.length - 2];
        if(lastValueTd) lastValueTd.remove();
    });
}
function collectCardData(card){
    const caseText = card.querySelector(".case-input").value.trim() || "Untitled experiment";

    const measurementLines = [];
    card.querySelectorAll(".obs-table tbody tr").forEach(row => {
        const label = row.querySelector(".param-label").value.trim() || "Parameter";
        const values = Array.from(row.querySelectorAll("input"))
            .filter(inp => !inp.classList.contains("param-label"))
            .map(i => i.value.trim())
            .filter(v => v !== "");
        if(values.length > 0){
            measurementLines.push(`${label}: ${values.join(", ")}`);
        }
    });

    const existingInsight = card.querySelector(".insight-input").value.trim();

    return { caseText, measurementLines, existingInsight };
}

const INSIGHT_MODES = {
    graphical: {
        label: "Graphical insight",
        instruction: "Focus on the graphical trend: describe how a plot of these measurements would likely look (shape of the curve, growth/decay, turning points, any correlation between amplitude/speed and the outcome). Describe it in words — you cannot draw an actual chart."
    },
    theoretical: {
        label: "Theoretical insight",
        instruction: "Focus on the underlying physics theory: explain what principle (e.g. resonance, damping, natural frequency, Hooke's law) most likely explains these results."
    },
    formula: {
        label: "Generalized formula",
        instruction: "Propose a simple generalized formula/equation relating the measured variables, based on the numbers given. State the formula clearly, then briefly explain each term."
    },
    simple: {
        label: "Simple",
        instruction: "Explain what happened in plain, simple language a child or someone with no physics background could understand. Avoid jargon, formulas, and technical terms — use an everyday comparison or analogy if it helps."
    }
};

// ---- sends the card's data to Gemini and drops the result into Insight ----
async function askGeminiForInsight(card, mode){
    const key = geminiKeyInput.value.trim();
    if(!key){
        alert("Add your Gemini API key above first (Google AI Studio issues free keys).");
        return;
    }

    const modeInfo = INSIGHT_MODES[mode] || INSIGHT_MODES.theoretical;
    const helpToggleBtn = card.querySelector(".help-btn");
    const insightInput = card.querySelector(".insight-input");
    const originalLabel = helpToggleBtn.textContent;
    helpToggleBtn.textContent = "Thinking...";
    helpToggleBtn.disabled = true;

    const { caseText, measurementLines, existingInsight } = collectCardData(card);

    const prompt = `You are a physics lab assistant helping a student write up a resonance/oscillation experiment.

Case: ${caseText}
Measurements:
${measurementLines.length ? measurementLines.join("\n") : "(none recorded)"}
${existingInsight ? `Student's notes so far: ${existingInsight}` : "Student hasn't written any notes yet."}

${modeInfo.instruction}
Keep it to 2-4 sentences, grounded in the numbers above where possible. Return ONLY the text — no preamble, no markdown, no labels.`;

    try{
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": key
                },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );

        if(!response.ok){
            const errText = await response.text();
            throw new Error(`${response.status} ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if(!text) throw new Error("Empty response from Gemini");

        insightInput.value = existingInsight
            ? `${existingInsight}\n\n--- ${modeInfo.label} (AI) ---\n${text}`
            : `--- ${modeInfo.label} (AI) ---\n${text}`;
    }catch(err){
        alert("Gemini request failed: " + err.message);
    }finally{
        helpToggleBtn.textContent = originalLabel;
        helpToggleBtn.disabled = false;
    }
}
