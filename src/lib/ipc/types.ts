export type Cognizable = "Cognizable" | "Non-cognizable" | "Depends on offence";
export type Bailable = "Bailable" | "Non-bailable" | "Depends on offence";
export type Compoundable =
  | "Compoundable"
  | "Compoundable with court permission"
  | "Non-compoundable"
  | "Not applicable";

export interface IpcSection {
  /** Section number as printed in the Code, e.g. "304A", "498A" */
  section: string;
  title: string;
  chapter: string;
  /** Plain-language summary of the provision (not verbatim statutory text). */
  summary: string;
  /** Essential ingredients the prosecution must establish. */
  ingredients: string[];
  punishment: string;
  cognizable: Cognizable;
  bailable: Bailable;
  compoundable: Compoundable;
  triableBy: string;
  /** Industrial / workplace relevance note, when any. */
  industrialNote?: string;
  /** Landmark cases or judicial notes. */
  judicialNote?: string;
  /** Approximate equivalent in Bharatiya Nyaya Sanhita, 2023. */
  bnsEquivalent?: string;
  keywords: string[];
}
