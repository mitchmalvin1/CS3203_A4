import asyncio
import websockets
import wave
import os
import pyaudio
import ffmpeg
import socket
from asyncio import Queue

connection_queue = Queue()

# Set up PyAudio for live playback
p = pyaudio.PyAudio()
stream = None

def get_public_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(('8.8.8.8', 1))  # Google DNS server
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        print(f"Unable to get local IP: {e}")
        return None


def start_audio_stream():
    global stream
    if stream is None:
        stream = p.open(format=pyaudio.paInt16, channels=1, rate=16000, output=True)

def stop_audio_stream():
    global stream
    if stream is not None:
        stream.stop_stream()
        stream.close()
        stream = None

async def handle_client(websocket, path):
    await connection_queue.put(websocket)
    if connection_queue.qsize() > 0 :
        await websocket.send("occupied")
        print("Client added to queue.")
    while True:
        # keeps the websocket alive for 60s,
        # otherwise the implementation of the websocket will cause it to close itself when caller terminates
        # ANNOYING AF >:( !!!!!!
        # see: https://github.com/aaugustin/websockets/issues/122
        await asyncio.sleep(60)


async def process_connections():
    while True:
        if not connection_queue.empty():
            audio_frames = []
            websocket = await connection_queue.get()
            print('Fetched websocket from q')
            print(f"WebSocket state: {websocket.state}") #this will print closed without the sleep in handle_client
            await websocket.send("available")
            print("signal availability to client")
            student_name = None
            while True : 
                try:
                    async for message in websocket:
                        #print(message)
                        if isinstance(message, str):
                            if not student_name:
                                student_name = message
                                print(f"Student's name: {student_name}")
                        else :
                            #print("Receiving and playing audio data...")
                            start_audio_stream()  # Start the audio stream if not already started
                            stream.write(message)  # Play the received audio data
                            audio_frames.append(message)
                except websockets.ConnectionClosed as e:
                    print(f"Connection closed: {e}")
                finally:
                    await write_wav_file(student_name, audio_frames)
                    stop_audio_stream()
                    audio_frames = []
                    print("Student disconnected")
                    break
        else:
            # If queue is empty, sleep for a short period before checking again
            await asyncio.sleep(1)

# Write the accumulated PCM data to a WAV file
async def write_wav_file(student_name,frames):
    filename = f"./audio-files/{student_name}_{int(asyncio.get_event_loop().time())}.wav"
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))  # 2 bytes for 16-bit PCM
        wf.setframerate(16000)
        wf.writeframes(b''.join(frames))

    print(f"Audio saved to {filename}")

async def main():
    public_ip = get_public_ip()
    server = await websockets.serve(handle_client, public_ip, 8000)
    print(f"WebSocket server started on ws://{public_ip}:8000")

    # Schedule the background task to process connections
    asyncio.ensure_future(process_connections())

    # Keep the server running
    await server.wait_closed()

# Start the event loop and run the main function
asyncio.run(main())

