// News feed registry. Each category aggregates several RSS feeds so a single
// dead outlet never leaves the dashboard empty.
//
// `aggregate: true` marks Google News feeds, whose titles are suffixed with
// " - Outlet" — server.js strips the suffix and uses it as the source name.

const GOOGLE_NEWS = 'https://news.google.com/rss';

function googleTopic(topic) {
  return {
    url: `${GOOGLE_NEWS}/headlines/section/topic/${topic}?hl=en-US&gl=US&ceid=US:en`,
    name: 'Google News',
    aggregate: true
  };
}

export const CATEGORIES = {
  headlines: {
    label: 'Headlines',
    feeds: [
      { url: `${GOOGLE_NEWS}?hl=en-US&gl=US&ceid=US:en`, name: 'Google News', aggregate: true },
      { url: 'http://feeds.bbci.co.uk/news/rss.xml', name: 'BBC News' },
      { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR' },
      { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' }
    ]
  },
  world: {
    label: 'World',
    feeds: [
      googleTopic('WORLD'),
      { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC News' },
      { url: 'https://feeds.npr.org/1004/rss.xml', name: 'NPR' },
      { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' }
    ]
  },
  business: {
    label: 'Business',
    feeds: [
      googleTopic('BUSINESS'),
      { url: 'http://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC News' },
      { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', name: 'MarketWatch' },
      { url: 'https://finance.yahoo.com/news/rssindex', name: 'Yahoo Finance' },
      { url: 'https://feeds.npr.org/1006/rss.xml', name: 'NPR' }
    ]
  },
  technology: {
    label: 'Technology',
    feeds: [
      googleTopic('TECHNOLOGY'),
      { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' },
      { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' },
      { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
      { url: 'http://feeds.bbci.co.uk/news/technology/rss.xml', name: 'BBC News' }
    ]
  },
  sports: {
    label: 'Sports',
    feeds: [
      googleTopic('SPORTS'),
      { url: 'https://www.espn.com/espn/rss/news', name: 'ESPN' },
      { url: 'https://feeds.bbci.co.uk/sport/rss.xml', name: 'BBC Sport' },
      { url: 'https://www.skysports.com/rss/12040', name: 'Sky Sports' }
    ]
  },
  science: {
    label: 'Science',
    feeds: [
      googleTopic('SCIENCE'),
      { url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml', name: 'BBC News' },
      { url: 'https://phys.org/rss-feed/', name: 'Phys.org' },
      { url: 'https://www.sciencedaily.com/rss/all.xml', name: 'ScienceDaily' }
    ]
  },
  health: {
    label: 'Health',
    feeds: [
      googleTopic('HEALTH'),
      { url: 'http://feeds.bbci.co.uk/news/health/rss.xml', name: 'BBC News' },
      { url: 'https://feeds.npr.org/1007/rss.xml', name: 'NPR' },
      { url: 'https://www.statnews.com/feed/', name: 'STAT' }
    ]
  },
  entertainment: {
    label: 'Entertainment',
    feeds: [
      googleTopic('ENTERTAINMENT'),
      { url: 'http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', name: 'BBC News' },
      { url: 'https://variety.com/feed/', name: 'Variety' },
      { url: 'https://www.hollywoodreporter.com/feed/', name: 'The Hollywood Reporter' }
    ]
  }
};
