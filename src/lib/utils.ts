export function cn(...inputs: any[]) {
  return inputs
    .flat()
    .filter(Boolean)
    .map((x) => {
      if (typeof x === "string") return x;
      if (typeof x === "object" && x !== null) {
        return Object.entries(x)
          .filter(([_, val]) => Boolean(val))
          .map(([key]) => key)
          .join(" ");
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}
