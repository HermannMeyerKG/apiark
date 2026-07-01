// Mock @tauri-apps/api for Vitest
export const invoke = vi.fn().mockResolvedValue(null);
export const getVersion = vi.fn().mockResolvedValue("0.0.0-test");
export const event = {
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
};
export function mockInvoke(command: string, result: unknown) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === command) return result;
    return null;
  });
}
