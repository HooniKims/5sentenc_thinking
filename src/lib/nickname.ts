const nicknameWords = ["별빛탐험가", "푸른나침반", "달빛구름", "노란연필", "햇살지도"] as const;

export function createNickname(random: () => number = Math.random): string {
  const word = nicknameWords[Math.floor(random() * nicknameWords.length)] ?? nicknameWords[0];
  const number = String(Math.floor(random() * 99) + 1).padStart(2, "0");
  return `${word} ${number}`;
}
