let ws;
let audioContext;
let workletNode;
let microphoneNode;
let isServerAvailable = true;
let studentName = "";
let isStreaming = false;
let recordedChunks = [];

function connectWebSocket() {
    ws = new WebSocket('ws://69e8-218-212-26-228.ngrok-free.app'); //change this to the public URL of the server after running ngrok
    ws.onopen = () => {
        document.getElementById('status').innerText = "Connected to server websocket";
    };
    ws.onmessage = (event) => {
        console.log(event.data)
        if (event.data === "occupied") {
            isServerAvailable = false;
            document.getElementById('status').innerText = "Connected to the server websocket, but another client is talking. Please wait.";
        } else if (event.data === "available") {
            isServerAvailable = true;
            document.getElementById('status').innerText = "Server is available, streaming audio..";
        }
    };
    ws.onclose = () => {
        document.getElementById('status').innerText = "Disconnected from server websocket";
    };
    ws.onerror = (error) => {
        console.error("WebSocket Error: ", error);
    };
}

function submitName() {
    const nameInput = document.getElementById('studentNameInput');
    studentName = nameInput.value.trim();

    if (studentName) {
        document.getElementById('status').innerText = `Welcome, ${studentName}! Press and hold the button to talk.`;
        document.getElementById('pttButton').style.display = "inline-block"; // Show PTT button
        document.getElementById('studentNameInput').style.display = "none"; // Hide input field
        document.getElementById('submitNameButton').style.display = "none"; // Hide submit button
    } else {
        alert("Please enter your name.");
    }
}

// Start streaming audio using Web Audio API with AudioWorklet
async function startStream() {
    connectWebSocket();
    if (isStreaming) return;

    audioContext = new AudioContext({ sampleRate: 16000 });
    console.log("Audio sample rate: ", audioContext.sampleRate);
    isStreaming = true;

    await audioContext.audioWorklet.addModule('workletProcessor.js');

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            // Create a MediaStreamAudioSourceNode from the stream
            microphoneNode = audioContext.createMediaStreamSource(stream);

            // Create an AudioWorkletNode that uses the registered processor
            workletNode = new AudioWorkletNode(audioContext, 'pcm-worklet-processor');

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(studentName);
            }

            // Handle messages from the AudioWorkletProcessor (PCM data)
            workletNode.port.onmessage = (event) => {
                if (isServerAvailable) {
                    const pcmDataBuffer = event.data; // The buffer sent from the worklet
                    // Save PCM data to an array for later use
                    recordedChunks.push(new Int16Array(pcmDataBuffer)); 
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(pcmDataBuffer); // Send the PCM data buffer over WebSocket
                    }
                }
            };

            microphoneNode.connect(workletNode);
        })
        .catch(error => {
            console.error('Error accessing microphone: ', error);
        });
}


function stopStream() {
    if (!isStreaming) return;
    isStreaming = false;

    if (workletNode) {
        workletNode.disconnect();
    }
    if (microphoneNode) {
        microphoneNode.disconnect();
    }
    if (audioContext) {
        audioContext.close();
    }

    saveAudioToFile();
    document.getElementById('status').innerText = "Stopped streaming raw PCM audio.";
    ws.close();
}

// Convert the recorded PCM data to a WAV file and trigger a download
function saveAudioToFile() {
    const buffer = mergeBuffers(recordedChunks);
    const wavBlob = encodeWAV(buffer);
    const url = URL.createObjectURL(wavBlob);

    // Create a link and download the file
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `${studentName}_client_audio.wav`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// Helper function to merge all PCM chunks into a single buffer
function mergeBuffers(chunks) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const mergedBuffer = new Int16Array(length);
    let offset = 0;
    chunks.forEach(chunk => {
        mergedBuffer.set(chunk, offset);
        offset += chunk.length;
    });
    return mergedBuffer;
}

// Helper function to encode raw PCM data into WAV format
function encodeWAV(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2); // 16-bit PCM
    const view = new DataView(buffer);

    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // Audio format: PCM
    view.setUint16(22, 1, true);  // Mono channel
    view.setUint32(24, 16000, true); // Sample rate (16 kHz)
    view.setUint32(28, 16000 * 2, true); // Byte rate (sample rate * 2 bytes per sample)
    view.setUint16(32, 2, true);  // Block align (2 bytes per sample)
    view.setUint16(34, 16, true); // Bits per sample: 16
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true); // Data chunk size

    // Write PCM data
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(44 + i * 2, samples[i], true); // Little-endian 16-bit PCM
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}