import type { ConsoleActivityItem } from "../../lib/console/contract";
import { Badge, Icon } from "../ui/ConsoleElements";

export function ActivityList({ items, detailed = false }: { items: ConsoleActivityItem[]; detailed?: boolean }) {
  return (
    <div className={`activity-list ${detailed ? "detailed" : ""}`}>
      {items.map((item) => (
        <article className="activity-item" data-reveal key={item.id}>
          <div className={`activity-icon ${item.status}`}>
            <Icon
              name={item.status === "pending" ? "queue" : item.status === "approved" || item.status === "auto_allowed" ? "check" : "x"}
              size={15}
            />
          </div>
          <div className="activity-title">
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </div>
          <div className="activity-outcome"><Badge status={item.status} /></div>
          <div className="activity-actor">
            <strong>
              {item.actor === "No reviewer decision"
                ? "No reviewer decision"
                : item.status === "pending"
                  ? "Awaiting human decision"
                  : item.status === "approved" || item.status === "denied"
                    ? "Human decision"
                    : "Policy outcome"}
            </strong>
            {item.actor !== "No reviewer decision" && <span>{item.actor}</span>}
            <span>Policy rule: {item.rule ?? "Unknown (not recorded)"}</span>
          </div>
          <time>{item.time}</time>
        </article>
      ))}
    </div>
  );
}
