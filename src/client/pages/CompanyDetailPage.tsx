import { Navigate, useParams } from "react-router-dom";
import { useData } from "../DataContext";

export function CompanyDetailPage() {
  const { slug } = useParams();
  const { data } = useData();
  const company = data?.companies.find((item) => item.slug === slug) ?? null;

  if (!company) return <Navigate to="/watch" replace />;
  return <Navigate to={`/watch?company=${encodeURIComponent(company.id)}`} replace />;
}
