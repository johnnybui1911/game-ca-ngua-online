import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { QualitySettings } from './quality';

/**
 * Post-processing chain of the medium and high tiers. Bloom works on the unclamped picture
 * with a threshold above white, so only highlights on gold and emissive parts glow; tone
 * mapping moves here from the renderer because the chain needs the picture before it.
 * Loaded on demand: the low tier never downloads it.
 */
export default function Effects({ settings }: { settings: QualitySettings }) {
  return (
    <EffectComposer multisampling={settings.antialiasing === 'msaa' ? 4 : 0}>
      {[
        ...(settings.bloom
          ? [<Bloom key="bloom" mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.25} intensity={0.45} radius={0.72} />]
          : []),
        <ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />,
        ...(settings.antialiasing === 'smaa' ? [<SMAA key="smaa" />] : []),
        <Vignette key="vignette" offset={0.28} darkness={0.62} />,
      ]}
    </EffectComposer>
  );
}
