type AvatarCropImageHandlers = {
  onLoad: (image: HTMLImageElement, sourceUrl: string) => void;
  onError: (error: AvatarCropImageError) => void;
};

export class AvatarCropImageError extends Error {
  readonly stage = "decode";

  constructor(message: string) {
    super(message);
    this.name = "AvatarCropImageError";
  }
}

export function loadAvatarCropImage(
  file: File,
  handlers: AvatarCropImageHandlers
): () => void {
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  let active = true;

  image.onload = () => {
    if (!active) return;

    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      handlers.onError(
        new AvatarCropImageError("La imagen no tiene dimensiones validas.")
      );
      return;
    }

    handlers.onLoad(image, sourceUrl);
  };
  image.onerror = () => {
    if (!active) return;
    handlers.onError(new AvatarCropImageError("El navegador no pudo decodificar la imagen."));
  };
  image.src = sourceUrl;

  return () => {
    active = false;
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(sourceUrl);
  };
}
