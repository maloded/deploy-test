/**
 * A tiny stand-in for the voice widget (the real one is not part of the tests): it dispatches the documented
 * "agent-command" event the way the package does (detail = the command plus respond(); bubbles, composed, cancelable) and
 * reads what the page answered. Like the package, respond() sends only the first answer.
 */
export type FakeCall = {
  /** preventDefault() was called: the page says "handled". */
  handled: boolean;
  /** Everything the page passed to respond() (the package would send only the first). */
  answers: unknown[];
  /** respond() had already been called when dispatchEvent returned: the answer needed no await. */
  answeredSynchronously: boolean;
};

export function fakeWidget(host: Element = document.body) {
  const element = document.createElement("fake-agent-widget");
  host.appendChild(element);
  return {
    element,
    command(type: string, payload?: unknown): FakeCall {
      const answers: unknown[] = [];
      const respond = (data: unknown) => void answers.push(data);
      const event = new CustomEvent("agent-command", { detail: { type, ...(payload === undefined ? {} : { payload }), respond }, bubbles: true, composed: true, cancelable: true });
      const notPrevented = element.dispatchEvent(event);
      return { handled: !notPrevented, answers, answeredSynchronously: answers.length > 0 };
    },
    remove: () => element.remove(),
  };
}
