const terminalSentenceBoundary = /[.!?]/u;

export function isSingleSentence(value: string): boolean {
  if (/[\r\n\u2028\u2029]/u.test(value)) {
    return false;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return false;
  }

  const sentences = trimmedValue
    .split(terminalSentenceBoundary)
    .filter((sentence) => sentence.trim().length > 0);

  return sentences.length === 1;
}

export function replaceSentence(
  sentences: readonly string[],
  index: number,
  value: string,
): readonly string[] {
  return sentences.map((sentence, sentenceIndex) =>
    sentenceIndex === index ? value : sentence,
  );
}
