export interface Message {
  msg_id: number;
  from: 'device' | 'web';
  text: string;
  ts: number;
}

export interface PollResponse {
  msgs: Message[];
  latest: number;
}

export interface Credentials {
  thread_id: string;
  pair_code: string;
}
