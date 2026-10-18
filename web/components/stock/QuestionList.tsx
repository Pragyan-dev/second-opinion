import styles from "./stock.module.css";

export function QuestionList({ questions }: { questions: string[] }) {
  if (!questions.length) return null;
  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Three questions to ask before buying</h2>
      <ol className={styles.questions}>{questions.map(q => <li key={q}>{q}</li>)}</ol>
    </div>
  );
}
