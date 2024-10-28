# CS3203 PTP WebSocket

## Initialization
To run the server, you can choose to create a python virtual env and run `pip install -run requirements.txt`. However, depending on the OS, you might need to install `PyAudio` separately by following the guide [here](https://pypi.org/project/PyAudio/). Afterwards, install Ngrok for tunneling services from [here](https://ngrok.com/download) depending on your OS, remember to add the authToken as well (yeah need to sign up or can just use my authToken).

Run `ngrok http 8000` to initialize the ngrok service, you will then see the **public URL** provided by ngrok, then run `python3 server/server.py` to initialize the server.

Edit the public URL of the server at `app.js` : 
```
ws = new WebSocket('ws://{public_URL_provided_by_ngrok}'); 

// For instance : 
ws = new WebSocket('ws://69e8-218-212-26-228.ngrok-free.app'); 
```

To run client on `localhost:8080`, go to `/client` directory and we can simply setup a web server provided by python using

```
python3 -m http.server 8080
```

## Running
Once the client page is opened up in `localhost:8080`, a websocket connection will be established with the server and you can simply enter the name and start to push and hold the button to start talking. Once the button is released, an audio file named `{student_name}_recorded_audio.webm` will be downloaded in your browser. This is client side's recorded can be used to compare against server's audio later on. To close the websocket connection, simply reload the client page (not ideal but for not its like this).

On the server's side, the audio will be streamed live and once the connection is closed, the audio will also be saved onto a file named `{student_name}_server_{unique_id}.wav` inside the `./audio-files` directory.

## Problems faced
### 1. Incompatible audio format between client and server
Initialy, client is using `MediaRecorder` as suggested by the sample code given on canvas. But `MediaRecorder` produces audio data in `.webm` (compressed) format and sends it through the websocket to the webserver to be played using `PyAudio`. However, `PyAudio` can only play the raw audio format `.wav` (or PCM). 

### 2. WebSocket automatically closed when the caller coroutine exits
Originally, there will be a coroutine that accepts a websocket connection from a client then pushes it to a `AsyncQueue` as well as another coroutine that reads from the `AsyncQueue` and processes (streams) the content. However, I realized after the websocket is pushed to the `AsyncQueue` and the caller coroutine exits. The websocket is automatically closed (due to the way the websocket API is defined in Python). See [this](https://github.com/python-websockets/websockets/issues/122).

## Attempted Solutions
### 1. Converting the format on server's side
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

### 2. Converting the format on client's side
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

Rather, we must use a different client API to record the audio and send `.wav` directly to server

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

### 3. Make the `handle_client()` coroutine sleep for a fixed time
By forcefully introducing `await asyncio.sleep(60)` in server's `handle_client()`, we ensure that this coroutine will not terminate and hence the websocket will not be automatically closed by the time it is accessed from the `AsyncQueue`.
