export interface ContentItem {
  type: 'news' | 'event';
  date: string;
  title: string;
  description: string;
  link: string;
  linkText: string;
  linkIcon: string;
  tags: string[];
}
