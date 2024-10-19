# CS3203 PTP WebSocket

## Initialization
To run client on `localhost:8080`, we can simply setup a web server provided by python using

```
python3 -m http.server 8080
```

To run the server, you can choose to create a python virtual env and run `pip install -run requirements.txt`. However, depending on the OS, you might need to install `PyAudio` separately by following the guide [here](https://pypi.org/project/PyAudio/). Afterwards, simply sun `python3 server/server.py` and the server will listen at `localhost:8000`

## Running
Once the client page is opened up in `localhost:8080`, a websocket connection will be established with the server and you can simply enter the name and start to push and hold the button to start talking. Once the button is released, an audio file named `{student_name}_recorded_audio.webm` will be downloaded in your browser. This is client side's recorded can be used to compare against server's audio later on. To close the websocket connection, simply reload the client page (not ideal but for not its like this).

On the server's side, the audio will be streamed live and once the connection is closed, the audio will also be saved onto a file named `{student_name}_{unique_id}.wav`

## Problem faced and attempted solution
### Incompatible audio format between client and server
Initialy, client is using `MediaRecorder` as suggested by the sample code given on canvas. But `MediaRecorder` produces audio data in `.webm` (compressed) format and sends it through the websocket to the webserver to be played using `PyAudio`. However, `PyAudio` can only play the raw audio format `.wav` (or PCM). 

#### Converting the format on server's side
Due to the incompatible format, I initially thought that the server side can simply convert it to the raw format (`.wav`) upon receiving in the websocket.
```
 # Decode the .webm using ffmpeg to raw PCM
process = (
    ffmpeg
    .input("audio.webm")
    .output('pipe:', format='wav')
    .run_async(pipe_stdout=True)
)

# Read the decoded audio from ffmpeg and play it
audio_data = process.stdout.read()
start_audio_stream()  #
stream.write(audio_data)
```
This solution doesn't work and just produces static noise (idk why).

#### Converting the format on client's side
The next solution involves converting the format on client's side to send `.wav` format directly. This means that we can no longer use the JS `MediaRecorder` as suggested like this : 

```
navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        // Send the student name as the first message to the server
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "name", data: studentName }));
        }

        // When audio data is available
        mediaRecorder.ondataavailable = function(event) {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                // Send audio data to WebSocket server
                if (ws.readyState === WebSocket.OPEN) {
                    console.log(`sending : ${event.data}`)
                    ws.send(event.data);
                }
            }
        };

        // Start recording
        mediaRecorder.start(100); // Record in chunks of 100ms
        document.getElementById('status').innerText = "Streaming and recording audio...";
    })
    .catch(error => {
        console.error('Error accessing microphone: ', error);
    });
```

Solution  : 

```
// Start streaming audio using Web Audio API with AudioWorklet
async function startStream() {
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
                const pcmDataBuffer = event.data; // The buffer sent from the worklet
                // Save PCM data to an array for later use
                recordedChunks.push(new Int16Array(pcmDataBuffer)); 
                console.log(pcmDataBuffer)
                if (ws.readyState === WebSocket.OPEN) {
                    console.log("sending to socket")
                    ws.send(pcmDataBuffer); // Send the PCM data buffer over WebSocket
                }
            };

            microphoneNode.connect(workletNode);

            document.getElementById('status').innerText = "Streaming raw PCM audio using AudioWorklet...";
        })
        .catch(error => {
            console.error('Error accessing microphone: ', error);
        });
}
```

I have tested locally with one client and one server only. It kinda works but the voice is a bit unclear (you can still make out what the person is saying)

