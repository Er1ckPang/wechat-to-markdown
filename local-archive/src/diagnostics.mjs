import { mkdir, appendFile } from 'node:fs/promises';
const folder = new URL('../logs/', import.meta.url);

export function friendlyError(error) {
  return String(error.message || error).replace(/^page\.evaluate:\s*(?:Error:\s*)?/, '').split(/\n\s*at /)[0].slice(0, 900);
}
export async function recordFailure(job, error, stage) {
  const redact = value => String(value || '').replace(/([?&](?:poc_token|access_token|token|secret)=)[^&\s]+/gi, '$1[hidden]');
  await mkdir(folder, { recursive: true });
  const entry = { at: new Date().toISOString(), job_id: job.id, original_url: job.url, stage,
    error_type: error.name, message: redact(error.message), stack: redact(error.stack) };
  await appendFile(new URL('failures.jsonl', folder), JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
}
