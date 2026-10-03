import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StudentCard } from "@/components/student-card";
import { toTitleCaseVi } from "@/lib/format";
import { getStudent, loadStudents } from "@/lib/students";

// Chỉ có các trang được tạo lúc build; slug lạ → 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return loadStudents().students.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/hv/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const student = getStudent(slug);
  return { title: student ? toTitleCaseVi(student.fullName) : "Không tìm thấy thẻ" };
}

export default async function StudentPage({ params }: PageProps<"/hv/[slug]">) {
  const { slug } = await params;
  const student = getStudent(slug);
  if (!student) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:py-10">
      <StudentCard student={student} updatedAt={loadStudents().generatedAt} />
    </main>
  );
}
