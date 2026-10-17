/* Generated from contracts/schema.json. Run make types; do not edit. */

export type Url = string;
export type Title = string;
export type Text = string;
export type Links = string[];
export type Emails = string[];
export type Phones = string[];
export type Tickers = string[];
export type Title1 = string;
export type Url1 = string;
export type Id = string;
export type Label = string;
export type Check = "pass" | "warn" | "fail" | "unknown";
export type Detail = string;
export type Weight = number;
export type Firm = string;
export type Crd = string | null;
export type Phone = string | null;
export type Website = string | null;
export type ReportId = string;
export type Status = "pending" | "running" | "done" | "error";
export type PageUrl = string;
export type Signals = Signal[];
export type Band = ("low" | "elevated" | "high" | "cant_tell") | null;
export type BandReason = string | null;
export type Explanation = string | null;
export type Agent = string;
export type Status1 = "pending" | "running" | "done" | "error";
export type Sources = Source[];
export type Error = string | null;
export type XrayId = string;
export type Symbol = string;
export type AssetType = "stock" | "etf" | "unknown";
export type Status2 = "pending" | "running" | "done" | "error";
export type Summary = string | null;
export type Questions = string[];
export type CustomerId = string;
export type FromAccountId = string;
export type PayeeAccountId = string;
export type PayeeName = string;
export type Amount = number;
export type ReportId1 = string | null;
export type Level = "ok" | "caution" | "stop";
export type Flags = Signal[];
export type HoldRecommended = boolean;
export type LinkedReport = string | null;

export interface SecondOpinionContracts {
  PageCapture?: PageCapture;
  Source?: Source;
  Signal?: Signal;
  OfficialContact?: OfficialContact;
  Report?: Report;
  AgentResult?: AgentResult;
  StockXray?: StockXray;
  PaymentRequest?: PaymentRequest;
  PaymentCheck?: PaymentCheck;
  [k: string]: unknown;
}
export interface PageCapture {
  url: Url;
  title: Title;
  text: Text;
  links?: Links;
  emails?: Emails;
  phones?: Phones;
  tickers?: Tickers;
  [k: string]: unknown;
}
export interface Source {
  title: Title1;
  url: Url1;
  [k: string]: unknown;
}
export interface Signal {
  id: Id;
  label: Label;
  check: Check;
  detail: Detail;
  source?: Source | null;
  weight?: Weight;
  [k: string]: unknown;
}
export interface OfficialContact {
  firm: Firm;
  crd?: Crd;
  phone?: Phone;
  website?: Website;
  source: Source;
  [k: string]: unknown;
}
export interface Report {
  report_id: ReportId;
  status: Status;
  page_url: PageUrl;
  entities: Entities;
  signals?: Signals;
  band?: Band;
  band_reason?: BandReason;
  explanation?: Explanation;
  official_contact?: OfficialContact | null;
  [k: string]: unknown;
}
export interface Entities {
  [k: string]: string[];
}
export interface AgentResult {
  agent: Agent;
  status: Status1;
  data?: Data;
  sources?: Sources;
  error?: Error;
  [k: string]: unknown;
}
export interface Data {
  [k: string]: unknown;
}
export interface StockXray {
  xray_id: XrayId;
  symbol: Symbol;
  asset_type: AssetType;
  status: Status2;
  sections: Sections;
  summary?: Summary;
  questions?: Questions;
  [k: string]: unknown;
}
export interface Sections {
  [k: string]: AgentResult;
}
export interface PaymentRequest {
  customer_id: CustomerId;
  from_account_id: FromAccountId;
  payee_account_id: PayeeAccountId;
  payee_name: PayeeName;
  amount: Amount;
  report_id?: ReportId1;
  [k: string]: unknown;
}
export interface PaymentCheck {
  level: Level;
  flags: Flags;
  hold_recommended: HoldRecommended;
  linked_report?: LinkedReport;
  official_contact?: OfficialContact | null;
  [k: string]: unknown;
}
