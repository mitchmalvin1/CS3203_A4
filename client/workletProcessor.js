class PCMWorkletProcessor extends AudioWorkletProcessor {
    // This method processes incoming audio data in real-time
    process(inputs, outputs, parameters) {
        const input = inputs[0]; // First input (mono)
        if (input.length > 0) {
            const channelData = input[0]; // First channel

            // Convert Float32 samples to 16-bit PCM
            const pcmData = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
                pcmData[i] = Math.max(-1, Math.min(1, channelData[i])) * 32767; // Scale and convert to 16-bit
            }

            // Send the PCM data to the main thread
            this.port.postMessage(pcmData.buffer); // Send as ArrayBuffer
        }

        return true; // Keep the processor alive
    }
}

// Register the processor with a name
registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
