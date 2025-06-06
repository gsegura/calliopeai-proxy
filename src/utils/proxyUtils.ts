export interface ParsedModel {
  ownerSlug: string;
  packageSlug: string;
  provider: string;
  modelName: string;
  isValid: boolean;
  error?: string;
}

export const parseModelString = (modelString: string): ParsedModel => {
  if (!modelString || typeof modelString !== 'string') {
    return {
      ownerSlug: '',
      packageSlug: '',
      provider: '',
      modelName: '',
      isValid: false,
      error: 'Model string is null, undefined, or not a string.'
    };
  }

  const parts = modelString.split('/');
  if (parts.length !== 4) {
    return {
      ownerSlug: '',
      packageSlug: '',
      provider: '',
      modelName: '',
      isValid: false,
      error: `Invalid model string format. Expected "{ownerSlug}/{packageSlug}/{provider}/{model}", but got "${modelString}". Parts found: ${parts.length}`
    };
  }

  const [ownerSlug, packageSlug, provider, modelName] = parts;

  if (!ownerSlug || !packageSlug || !provider || !modelName) {
    return {
        ownerSlug,
        packageSlug,
        provider,
        modelName,
        isValid: false,
        error: `One or more parts of the model string are empty. Received: ownerSlug='${ownerSlug}', packageSlug='${packageSlug}', provider='${provider}', modelName='${modelName}'`
    };
  }

  return {
    ownerSlug,
    packageSlug,
    provider,
    modelName,
    isValid: true
  };
};
