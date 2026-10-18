/* Generated from contracts/schema.json. Run make types; do not edit. */

export type SourceType = "website" | "email" | "social_post" | "stock_page";
export type Url = string;
export type Title = string;
export type Text = string;
export type Sender = string | null;
export type Links = string[];
export type Emails = string[];
export type Phones = string[];
export type Tickers = string[];
export type EmailTitle = string | null;
export type EmailBody = string | null;
export type Title1 = string;
export type Url1 = string;
export type Id = string;
export type Label = string;
export type Check = "pass" | "warn" | "fail" | "unknown";
export type Detail = string;
export type Weight = number;
export type Flag = string;
export type Label1 = string;
export type Confidence = number;
export type Evidence = string;
export type StartUrl = string;
export type FinalUrl = string;
export type PagesVisited = string[];
export type ClaimedFirm = string | null;
export type ClaimedCrd = string | null;
export type Phones1 = string[];
export type Emails1 = string[];
export type DomainAgeDays = number | null;
export type Firm = string;
export type Crd = string | null;
export type Phone = string | null;
export type Website = string | null;
export type Text1 = string;
export type Id1 = string;
export type Label2 = string;
export type Detail1 = string;
export type Evidence1 = string;
export type Weight1 = number;
export type EmailTitle1 = string;
export type Sender1 = string | null;
export type LinkRequested = string | null;
export type Summary = string;
export type Reasons = PhishingReason[];
export type ReportId = string;
export type Status = "pending" | "running" | "done" | "error";
export type SourceType1 = "website" | "email" | "social_post" | "stock_page";
export type PageUrl = string;
export type Signals = Signal[];
export type JevScores = JevScore[];
export type FraudLikelihood = number | null;
export type Band = ("low" | "elevated" | "high" | "cant_tell") | null;
export type BandReason = string | null;
export type Explanation = string | null;
export type StockPros = ProCon[];
export type StockCons = ProCon[];
export type StockResearchId = string | null;
export type Agent = string;
export type Status1 = "pending" | "running" | "done" | "error";
export type Sources = Source[];
export type Error = string | null;
export type Title2 = string;
export type Url2 = string;
export type Outlet = string;
export type Published = string;
export type Summary1 = string;
export type Relevance = number;
export type IsPressRelease = boolean;
export type ResearchId = string;
export type Symbol = string;
export type AssetType = "stock" | "etf" | "unknown";
export type Status2 = "pending" | "running" | "done" | "error";
export type Summary2 = string | null;
export type Articles = Article[];
export type Pros = ProCon[];
export type Cons = ProCon[];
export type Questions = string[];
export type Symbol1 = string;
export type Side = "buy";
export type Quantity = number;
export type OrderType = "market" | "limit";
export type LimitPrice = number | null;
export type TimeInForce = "gfd" | "gtc";
export type ResearchId1 = string | null;
export type Symbol2 = string;
export type Name = string;
export type LastPrice = number;
export type EstTotal = number;
export type Tradable = boolean | null;
export type BuyingPowerOk = boolean | null;
export type Warnings = string[];
export type DataSource = "robinhood_mcp" | "cached" | "simulated";
export type Status3 = "awaiting_human";
export type CustomerId = string;
export type FromAccountId = string;
export type ToAccountId = string;
export type Amount = number;
export type HumanConfirmed = boolean;

export interface SecondOpinionContracts {
  Capture?: Capture;
  Source?: Source;
  Signal?: Signal;
  JevScore?: JevScore;
  SiteVisit?: SiteVisit;
  OfficialContact?: OfficialContact;
  ProCon?: ProCon;
  PhishingReason?: PhishingReason;
  PhishingCheck?: PhishingCheck;
  FraudReport?: FraudReport;
  AgentResult?: AgentResult;
  Article?: Article;
  StockReport?: StockReport;
  OrderTicket?: OrderTicket;
  OrderPreview?: OrderPreview;
  FundingRequest?: FundingRequest;
  [k: string]: unknown;
}
export interface Capture {
  source_type: SourceType;
  url: Url;
  title: Title;
  text: Text;
  sender?: Sender;
  links?: Links;
  emails?: Emails;
  phones?: Phones;
  tickers?: Tickers;
  email_title?: EmailTitle;
  email_body?: EmailBody;
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
export interface JevScore {
  flag: Flag;
  label: Label1;
  confidence: Confidence;
  evidence: Evidence;
  [k: string]: unknown;
}
export interface SiteVisit {
  start_url: StartUrl;
  final_url: FinalUrl;
  pages_visited: PagesVisited;
  claimed_firm?: ClaimedFirm;
  claimed_crd?: ClaimedCrd;
  phones?: Phones1;
  emails?: Emails1;
  domain_age_days?: DomainAgeDays;
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
export interface ProCon {
  text: Text1;
  source?: Source | null;
  [k: string]: unknown;
}
export interface PhishingReason {
  id: Id1;
  label: Label2;
  detail: Detail1;
  evidence?: Evidence1;
  weight?: Weight1;
  [k: string]: unknown;
}
export interface PhishingCheck {
  email_title: EmailTitle1;
  sender?: Sender1;
  link_requested?: LinkRequested;
  summary: Summary;
  reasons?: Reasons;
  [k: string]: unknown;
}
export interface FraudReport {
  report_id: ReportId;
  status: Status;
  source_type: SourceType1;
  page_url: PageUrl;
  entities: Entities;
  site_visit?: SiteVisit | null;
  phishing?: PhishingCheck | null;
  signals?: Signals;
  jev_scores?: JevScores;
  fraud_likelihood?: FraudLikelihood;
  band?: Band;
  band_reason?: BandReason;
  explanation?: Explanation;
  official_contact?: OfficialContact | null;
  stock_pros?: StockPros;
  stock_cons?: StockCons;
  stock_research_id?: StockResearchId;
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
export interface Article {
  title: Title2;
  url: Url2;
  outlet: Outlet;
  published: Published;
  summary: Summary1;
  relevance: Relevance;
  is_press_release: IsPressRelease;
  [k: string]: unknown;
}
export interface StockReport {
  research_id: ResearchId;
  symbol: Symbol;
  asset_type: AssetType;
  status: Status2;
  sections: Sections;
  summary?: Summary2;
  articles?: Articles;
  pros?: Pros;
  cons?: Cons;
  questions?: Questions;
  [k: string]: unknown;
}
export interface Sections {
  [k: string]: AgentResult;
}
export interface OrderTicket {
  symbol: Symbol1;
  side?: Side;
  quantity: Quantity;
  order_type: OrderType;
  limit_price?: LimitPrice;
  time_in_force?: TimeInForce;
  research_id?: ResearchId1;
  [k: string]: unknown;
}
export interface OrderPreview {
  symbol: Symbol2;
  name: Name;
  last_price: LastPrice;
  est_total: EstTotal;
  tradable?: Tradable;
  buying_power_ok?: BuyingPowerOk;
  warnings?: Warnings;
  data_source: DataSource;
  status?: Status3;
  [k: string]: unknown;
}
export interface FundingRequest {
  customer_id: CustomerId;
  from_account_id: FromAccountId;
  to_account_id: ToAccountId;
  amount: Amount;
  human_confirmed: HumanConfirmed;
  [k: string]: unknown;
}
