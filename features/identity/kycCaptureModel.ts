

export type KycCaptureKey = 'front' | 'selfie';

export interface KycCaptureResult {
  front: string;
  selfie: string;
}

export interface KycWizardModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (payload: KycCaptureResult) => void;
  isSubmitting: boolean;
  initialValues?: Partial<Record<KycCaptureKey, string | null>>;
}

export const DOCUMENT_STEPS: { key: KycCaptureKey; title: string; description: string }[] = [
  {
    key: 'front',
    title: 'Scanner le recto',
    description: 'Cadrez le recto de votre pièce d’identité dans le gabarit lumineux.',
  },
  {
    key: 'selfie',
    title: 'Selfie de vérification',
    description: 'Regardez la caméra et centrez votre visage dans le cercle.',
  },
];

export const STABILITY_THRESHOLD = 0.045;
export const STABILITY_DURATION_MS = 1500;
export const KYC_CAPTURE_MAX_EDGE = 1600;
export const KYC_CAPTURE_MIN_EDGE = 720;
export const KYC_CAPTURE_QUALITY = 0.6;
export const MANUAL_CAPTURE_DELAY_MS = 5000;
export const ANDROID_CAMERA_RELEASE_DELAY_MS = 300;

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const parsePictureSize = (size: string) => {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    size,
    width,
    height,
    area: width * height,
    maxEdge: Math.max(width, height),
    minEdge: Math.min(width, height),
  };
};

export const chooseKycPictureSize = (sizes: string[]) => {
  const parsedSizes = sizes
    .map(parsePictureSize)
    .filter((size): size is NonNullable<ReturnType<typeof parsePictureSize>> => Boolean(size));

  if (parsedSizes.length === 0) {
    return undefined;
  }

  const readableSizes = parsedSizes.filter((size) => size.minEdge >= KYC_CAPTURE_MIN_EDGE);
  const cappedSizes = readableSizes.filter((size) => size.maxEdge <= KYC_CAPTURE_MAX_EDGE);

  if (cappedSizes.length > 0) {
    return [...cappedSizes].sort((a, b) => b.area - a.area)[0].size;
  }

  if (readableSizes.length > 0) {
    return [...readableSizes].sort((a, b) => a.area - b.area)[0].size;
  }

  return [...parsedSizes].sort((a, b) => b.area - a.area)[0].size;
};
