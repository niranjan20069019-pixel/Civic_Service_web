/**
 * Analytics Store
 *
 * Computes analytics directly from the IssueStore (in-memory equivalent
 * of querying the PostgreSQL materialized views).
 *
 * In production, replace every method body with a single DB query against
 * the corresponding mv_analytics_* materialized view.
 */

const { IssueStore } = require('./store');

const AnalyticsStore = {
  /**
   * mv_analytics_summary equivalent.
   * Returns overall totals, resolved %, and avg resolution time.
   */
  getSummary() {
    const all = IssueStore.findAll({ page: 1, limit: 1e6 }).data;
    const total = all.length;
    const resolved = all.filter((i) => ['resolved', 'closed'].includes(i.status));
    const resolvedCount = resolved.length;

    const resolutionTimes = resolved
      .filter((i) => i.resolvedAt)
      .map((i) => (new Date(i.resolvedAt) - new Date(i.createdAt)) / 3_600_000);

    const avgResolutionHours =
      resolutionTimes.length > 0
        ? +(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length).toFixed(2)
        : null;

    // Per-category avg
    const categories = [...new Set(all.map((i) => i.category))];
    const perCategory = categories.map((cat) => {
      const catIssues = all.filter((i) => i.category === cat);
      const catResolved = catIssues.filter((i) => i.resolvedAt);
      const catTimes = catResolved.map(
        (i) => (new Date(i.resolvedAt) - new Date(i.createdAt)) / 3_600_000
      );
      return {
        category: cat,
        total: catIssues.length,
        resolved_count: catResolved.length,
        avg_resolution_hours:
          catTimes.length > 0
            ? +(catTimes.reduce((a, b) => a + b, 0) / catTimes.length).toFixed(2)
            : null,
      };
    });

    return {
      total_issues: total,
      resolved_count: resolvedCount,
      resolved_pct: total > 0 ? +((resolvedCount / total) * 100).toFixed(2) : 0,
      avg_resolution_hours_overall: avgResolutionHours,
      per_category: perCategory,
    };
  },

  /**
   * mv_analytics_by_category equivalent.
   */
  getByCategory() {
    const all = IssueStore.findAll({ page: 1, limit: 1e6 }).data;
    const map = {};

    for (const issue of all) {
      const cat = issue.category;
      if (!map[cat]) {
        map[cat] = { category: cat, total: 0, resolved_count: 0, resolution_times: [], response_times: [] };
      }
      map[cat].total++;
      if (['resolved', 'closed'].includes(issue.status)) {
        map[cat].resolved_count++;
        if (issue.resolvedAt) {
          map[cat].resolution_times.push(
            (new Date(issue.resolvedAt) - new Date(issue.createdAt)) / 3_600_000
          );
        }
      }
      if (issue.firstResponseAt) {
        map[cat].response_times.push(
          (new Date(issue.firstResponseAt) - new Date(issue.createdAt)) / 3_600_000
        );
      }
    }

    return Object.values(map).map(({ category, total, resolved_count, resolution_times, response_times }) => ({
      category,
      total,
      resolved_count,
      resolved_pct: total > 0 ? +((resolved_count / total) * 100).toFixed(2) : 0,
      avg_resolution_hours:
        resolution_times.length > 0
          ? +(resolution_times.reduce((a, b) => a + b, 0) / resolution_times.length).toFixed(2)
          : null,
      avg_first_response_hours:
        response_times.length > 0
          ? +(response_times.reduce((a, b) => a + b, 0) / response_times.length).toFixed(2)
          : null,
    }));
  },

  /**
   * mv_analytics_by_status equivalent — status funnel.
   */
  getByStatus() {
    const all = IssueStore.findAll({ page: 1, limit: 1e6 }).data;
    const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'rejected'];
    const counts = {};
    for (const s of STATUSES) counts[s] = 0;
    for (const issue of all) {
      if (counts[issue.status] !== undefined) counts[issue.status]++;
    }
    return STATUSES.map((status) => ({ status, total: counts[status] }));
  },

  /**
   * mv_analytics_response_time equivalent — daily time-series.
   * @param {'daily'|'weekly'} granularity
   */
  getResponseTimeSeries(granularity = 'daily') {
    const all = IssueStore.findAll({ page: 1, limit: 1e6 }).data;
    const buckets = {};

    for (const issue of all) {
      const d = new Date(issue.createdAt);
      let key;
      if (granularity === 'weekly') {
        // ISO week: set to Monday of the week
        const day = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - day + 1);
        monday.setHours(0, 0, 0, 0);
        key = monday.toISOString().slice(0, 10);
      } else {
        key = d.toISOString().slice(0, 10);
      }

      if (!buckets[key]) {
        buckets[key] = { period: key, issues_created: 0, response_times: [], resolution_times: [] };
      }
      buckets[key].issues_created++;

      if (issue.firstResponseAt) {
        buckets[key].response_times.push(
          (new Date(issue.firstResponseAt) - new Date(issue.createdAt)) / 3_600_000
        );
      }
      if (issue.resolvedAt) {
        buckets[key].resolution_times.push(
          (new Date(issue.resolvedAt) - new Date(issue.createdAt)) / 3_600_000
        );
      }
    }

    return Object.values(buckets)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(({ period, issues_created, response_times, resolution_times }) => ({
        period,
        granularity,
        issues_created,
        avg_first_response_hours:
          response_times.length > 0
            ? +(response_times.reduce((a, b) => a + b, 0) / response_times.length).toFixed(2)
            : null,
        avg_resolution_hours:
          resolution_times.length > 0
            ? +(resolution_times.reduce((a, b) => a + b, 0) / resolution_times.length).toFixed(2)
            : null,
      }));
  },

  /**
   * mv_analytics_heatmap equivalent.
   * Returns a GeoJSON FeatureCollection of issue cluster centroids.
   * Uses a simple k-means approximation for in-memory (PostGIS ST_ClusterKMeans
   * is used in production via the materialized view).
   */
  getHeatmap() {
    const all = IssueStore.findAll({ page: 1, limit: 1e6 }).data;
    const withGeo = all.filter((i) => i.location?.lat && i.location?.lng);

    if (withGeo.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }

    // Simple k-means (k=min(20, n)) for in-memory implementation
    const k = Math.min(20, withGeo.length);
    const points = withGeo.map((i) => ({ lat: i.location.lat, lng: i.location.lng, issue: i }));
    const clusters = kMeansCluster(points, k);

    const features = clusters
      .filter((c) => c.points.length > 0)
      .map((cluster, idx) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [cluster.centroid.lng, cluster.centroid.lat],
        },
        properties: {
          cluster_id: idx,
          issue_count: cluster.points.length,
          categories: [...new Set(cluster.points.map((p) => p.issue.category))],
        },
      }));

    return { type: 'FeatureCollection', features };
  },
};

// ---------------------------------------------------------------------------
// Simple k-means clustering (Euclidean, good enough for geo in small areas)
// ---------------------------------------------------------------------------
function kMeansCluster(points, k, maxIter = 50) {
  // Initialise centroids by picking k random distinct points
  const shuffled = [...points].sort(() => Math.random() - 0.5);
  let centroids = shuffled.slice(0, k).map((p) => ({ lat: p.lat, lng: p.lng }));

  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to nearest centroid
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let j = 0; j < centroids.length; j++) {
        const d =
          (points[i].lat - centroids[j].lat) ** 2 + (points[i].lng - centroids[j].lng) ** 2;
        if (d < minDist) { minDist = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    // Recompute centroids
    const sums = Array.from({ length: k }, () => ({ lat: 0, lng: 0, count: 0 }));
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c].lat += points[i].lat;
      sums[c].lng += points[i].lng;
      sums[c].count++;
    }
    centroids = sums.map((s, j) =>
      s.count > 0 ? { lat: s.lat / s.count, lng: s.lng / s.count } : centroids[j]
    );
  }

  // Build cluster objects
  const clusters = Array.from({ length: k }, (_, j) => ({ centroid: centroids[j], points: [] }));
  for (let i = 0; i < points.length; i++) {
    clusters[assignments[i]].points.push(points[i]);
  }
  return clusters;
}

module.exports = { AnalyticsStore };
