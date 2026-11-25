/** A request's state, as the Journals page keeps it: the data, once there, rides along. */
export interface Remote<T> {
  status: 'loading' | 'ok' | 'error' | 'notFound';
  data?: T;
}
