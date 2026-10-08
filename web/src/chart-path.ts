export function smoothPath(points: readonly { x: number; y: number }[]) {
  if (!points.length) return "";
  const slopes = points
    .slice(1)
    .map((point, i) => (point.y - points[i].y) / (point.x - points[i].x || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0] || 0;
    if (i === points.length - 1) return slopes[i - 1] || 0;
    const before = slopes[i - 1],
      after = slopes[i];
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  });
  const coordinate = (x: number, y: number) =>
    `${x.toFixed(2)},${y.toFixed(2)}`;
  return (
    `M${coordinate(points[0].x, points[0].y)}` +
    points
      .slice(1)
      .map((point, i) => {
        const previous = points[i];
        const third = (point.x - previous.x) / 3;
        return ` C${coordinate(previous.x + third, previous.y + tangents[i] * third)} ${coordinate(point.x - third, point.y - tangents[i + 1] * third)} ${coordinate(point.x, point.y)}`;
      })
      .join("")
  );
}
