import asyncio
import websockets
import wave
import os
import pyaudio
import ffmpeg

# Global variable to store the current client connection
current_client = None

# Set up PyAudio for live playback
p = pyaudio.PyAudio()
stream = None
audio_frames = []

# Function to initialize audio playback stream
def start_audio_stream():
    global stream
    if stream is None:
        stream = p.open(format=pyaudio.paInt16, channels=1, rate=16000, output=True)

# Function to stop audio playback stream
def stop_audio_stream():
    global stream
    if stream is not None:
        stream.stop_stream()
        stream.close()
        stream = None

# Handle each WebSocket connection
async def handle_connection(websocket, path):
    global current_client

    if current_client is not None:
        # Reject new connections if another client is already streaming
        await websocket.send("Another student is already talking, please wait.")
        await websocket.close()
        return

    current_client = websocket
    print("A student connected!")

    student_name = None
    audio_data = bytearray()

    try:
        async for message in websocket:
            if isinstance(message, str):
                if not student_name:
                    student_name = message
                    print(f"Student's name: {student_name}")
            # elif isinstance(message, bytes):
            else :
                print("Receiving and playing audio data...")
                start_audio_stream()  # Start the audio stream if not already started
                stream.write(message)  # Play the received audio data
                audio_frames.append(message)
    except websockets.ConnectionClosed as e:
        print(f"Connection closed: {e}")
    finally:
       
        await write_wav_file(student_name, audio_frames)
            
        stop_audio_stream()
        current_client = None  # Allow a new connection
        print("Student disconnected")

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
    async with websockets.serve(handle_connection, "localhost", 8000):
        print("WebSocket server is listening on ws://localhost:8000")
        await asyncio.Future()  # Run the server forever

if __name__ == "__main__":
    asyncio.run(main())
