type Lesson = {
  title: string;
  completed: boolean;
};

function summarizeLessons(lessons: Lesson[]) {
  if (lessons.length === 0) {
  }

  return lessons.map(lesson => lesson.title).join(', ');
}

// Try a blank line below, or put the cursor after the if statement above.
