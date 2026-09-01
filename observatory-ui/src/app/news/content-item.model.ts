export interface ContentItem {
  type: 'news' | 'event';
  date: string;
  title: string;
  description: string;
  // Optional -- not every item has an external link to point to (e.g. an internal meeting note).
  link?: string;
  linkText?: string;
  linkIcon?: string;
  tags: string[];
}
