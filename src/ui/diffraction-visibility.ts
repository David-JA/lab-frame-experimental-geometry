/** Display-only heuristic on the black preview background, not a detection gate. */
export const HKL_LABEL_MIN_GRAY=16;
export function displayGray(signal:number,upper:number,threshold=0):number {
  return signal<threshold?0:Math.round(255*Math.min(1,signal/upper));
}
export function labelVisible(peak:number,upper:number,threshold=0):boolean {
  return displayGray(peak,upper,threshold)>=HKL_LABEL_MIN_GRAY;
}
