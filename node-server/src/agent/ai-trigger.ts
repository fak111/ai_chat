export function shouldTriggerAI(content: string, replyToMessageType?: string): boolean {
  if (/@[Aa][Ii]\b/.test(content)) return true;
  if (replyToMessageType === 'AI') return true;
  return false;
}

export function cleanContentForAI(content: string): string {
  return content.replace(/@[Aa][Ii]\b/g, '[提问A宝]');
}
