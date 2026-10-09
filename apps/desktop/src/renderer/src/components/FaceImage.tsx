import React, { useState } from 'react';

/** A person's face crop, laid over its avatar. Renders nothing until there is one that loads. */
export const FaceImage: React.FC<{ src?: string }> = ({ src }) => {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return null;
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setFailed(src)}
    />
  );
};
