export type SessionActionMode = "narrated" | "ledger" | "scene";

export type SessionActionPhase =
  | "session-start"
  | "background-save-wait-start"
  | "background-save-wait-complete"
  | "base-persist-complete"
  | "checkpoint-complete"
  | "engine-complete"
  | "memory-complete"
  | "prompt-complete"
  | "provider-complete"
  | "receipt-complete"
  | "action-durable"
  | "save-start"
  | "wal-build-complete"
  | "save-complete";

export type SessionActionTrace = (phase: SessionActionPhase, at: number) => void;

export interface SessionActionRequest {
  id: string;
  params: Record<string, unknown>;
  mode: SessionActionMode;
  intent?: string;
  events?: Array<{ id: string; params: Record<string, unknown> }>;
  trace?: SessionActionTrace;
}

// 화면과 미래 Worker가 공유하는 봉투다. sequence는 UI 호출 순서를, sessionId는
// 채팅 전환 뒤 늦게 도착한 결과를 구분한다. 엔진 저널의 영구 순서는 result의
// parent/next cursor가 담당하므로 이 숫자를 세이브 정본으로 오해하지 않는다.
export interface SessionActionEnvelope extends SessionActionRequest {
  readonly sessionId: string;
  readonly actionSequence: number;
}

export interface SessionRevisionCursor {
  readonly turn: number;
  readonly eventCursor: number;
  readonly engineRevision: string;
}

export interface SessionActionResult<T = Record<string, unknown>[]> {
  readonly sessionId: string;
  readonly actionSequence: number;
  readonly actionId: string;
  readonly mode: SessionActionMode;
  readonly parent: SessionRevisionCursor;
  readonly next: SessionRevisionCursor;
  readonly value: T;
}

export type SessionActionOutcome<T = Record<string, unknown>[]> =
  | { readonly status: "applied"; readonly result: SessionActionResult<T> }
  | { readonly status: "stale"; readonly sessionId: string; readonly actionSequence: number };

export type SessionActionRunner<T> = (command: SessionActionEnvelope) => Promise<{
  value: T;
  parent: SessionRevisionCursor;
  next: SessionRevisionCursor;
}>;

// 실행 위치가 메인 스레드이든 Worker이든 화면이 보는 계약은 같다. bind()가 바뀌면
// 아직 시작하지 않은 옛 채팅 명령은 실행하지 않고, 이미 돌던 늦은 결과도 폐기한다.
export class SessionActionQueue {
  #binding = 0;
  #sequence = 0;
  #sessionId: string | null = null;
  #tail: Promise<void> = Promise.resolve();

  get sessionId() {
    return this.#sessionId;
  }

  bind(sessionId: string | null) {
    if (this.#sessionId === sessionId) return;
    this.#sessionId = sessionId;
    this.#binding += 1;
  }

  async execute<T>(request: SessionActionRequest, runner: SessionActionRunner<T>): Promise<SessionActionOutcome<T>> {
    const sessionId = this.#sessionId;
    if (!sessionId) throw new Error("session_action_unbound");
    const binding = this.#binding,
      actionSequence = ++this.#sequence,
      command: SessionActionEnvelope = { ...request, sessionId, actionSequence };
    let resolveOutcome!: (value: SessionActionOutcome<T>) => void,
      rejectOutcome!: (reason: unknown) => void;
    const outcome = new Promise<SessionActionOutcome<T>>((resolve, reject) => {
      resolveOutcome = resolve;
      rejectOutcome = reject;
    });
    this.#tail = this.#tail.catch(() => {}).then(async () => {
      if (this.#binding !== binding || this.#sessionId !== sessionId) {
        resolveOutcome({ status: "stale", sessionId, actionSequence });
        return;
      }
      try {
        const completed = await runner(command);
        if (this.#binding !== binding || this.#sessionId !== sessionId) {
          resolveOutcome({ status: "stale", sessionId, actionSequence });
          return;
        }
        resolveOutcome({
          status: "applied",
          result: {
            sessionId,
            actionSequence,
            actionId: request.id,
            mode: request.mode,
            parent: completed.parent,
            next: completed.next,
            value: completed.value,
          },
        });
      } catch (error) {
        rejectOutcome(error);
      }
    });
    return outcome;
  }
}
