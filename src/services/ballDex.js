const spawnPatterns = [
  /(?:a|an)\s+wild\s+(.+?)\s+(?:has\s+)?spawned/i,
  /(?:wild|spawned|appeared)\s*[:!—-]?\s*(.+)/i,
  /a new ball has spawned/i
];

export function detectBallDexName(message) {
  if (!message.guild || message.author?.bot === false) return null;
  const pieces = [];
  if (message.content) pieces.push(message.content);
  for (const embed of message.embeds || []) {
    if (embed.title) pieces.push(embed.title);
    if (embed.description) pieces.push(embed.description);
    for (const field of embed.fields || []) pieces.push(`${field.name}: ${field.value}`);
  }
  const text = pieces.join("\n").replace(/\s+/g, " ").trim();
  if (!/spawn|appeared|wild ball/i.test(text)) return null;
  for (const pattern of spawnPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1].replace(/[\n.!]+$/g, "").slice(0, 80).trim();
      if (name && !/click|catch|quickly|claim/i.test(name)) return name;
    }
  }
  const match = text.match(/(?:spawned|appeared)\s+(?:a|an)?\s*([A-Z][A-Za-z0-9 '’-]{1,60})/);
  return match?.[1]?.trim() || null;
}
