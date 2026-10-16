class RovidxCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.sum=0;this.count=0;this.phase=0;this.buffer=new Float32Array(1600);this.at=0;
  }
  process(inputs) {
    const channel=inputs[0]?.[0];
    if(!channel)return true;
    // Integrate input samples before downsampling to reduce aliasing. The phase persists between blocks.
    for(const sample of channel){
      this.sum+=sample;this.count++;this.phase+=16000;
      if(this.phase>=sampleRate){
        this.phase-=sampleRate;this.buffer[this.at++]=this.sum/this.count;this.sum=0;this.count=0;
        if(this.at===this.buffer.length){this.port.postMessage(this.buffer);this.buffer=new Float32Array(1600);this.at=0;}
      }
    }
    return true;
  }
}
registerProcessor('rovidx-capture',RovidxCapture);
