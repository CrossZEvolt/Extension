import {validatePercent} from '../shared/protocol.js';

export function createAudioGraph({context,source,percent}) {
  validatePercent(percent);
  const gain=context.createGain(),compressor=context.createDynamicsCompressor();
  gain.gain.value=percent/100;
  Object.entries({threshold:-3,knee:0,ratio:20,attack:0.003,release:0.1}).forEach(([key,value])=>{compressor[key].value=value;});
  source.connect(gain);gain.connect(compressor);compressor.connect(context.destination);
  return {
    setPercent(next){validatePercent(next);const now=context.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(next/100,now+0.02);},
    dispose(){source.disconnect();gain.disconnect();compressor.disconnect();},
  };
}
