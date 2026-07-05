/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IStudent, IStudentItem } from '../../models';
import { StudentResultCircle } from '@datalayer/core/lib/components/students/StudentResultCircle';

const getExerciseScore = (studentItem?: IStudentItem) => {
  if (studentItem && studentItem.score) {
    return studentItem.score;
  }
  return 0;
};

type Props = {
  student?: IStudent;
  studentItem?: IStudentItem;
};

export const StudentItemStatus = (props: Props) => {
  const { studentItem } = props;
  if (!studentItem) {
    return <StudentResultCircle status="none" label="No result yet" />;
  }
  switch (studentItem.itemType) {
    case 'dataset': {
      if (studentItem.completed === undefined) {
        return (
          <StudentResultCircle status="none" label="Dataset not started" />
        );
      }
      const completed = Boolean(studentItem.completed);
      return (
        <StudentResultCircle
          status={completed ? 'pass' : 'fail'}
          label={completed ? 'Dataset completed' : 'Dataset not completed'}
        />
      );
    }
    case 'lesson': {
      if (studentItem.completed === undefined) {
        return <StudentResultCircle status="none" label="Lesson not started" />;
      }
      const completed = Boolean(studentItem.completed);
      return (
        <StudentResultCircle
          status={completed ? 'pass' : 'fail'}
          label={completed ? 'Lesson completed' : 'Lesson not completed'}
        />
      );
    }
    case 'exercise': {
      const hasResult =
        Boolean(studentItem.id) ||
        Boolean(studentItem.codeStudent) ||
        studentItem.score !== undefined;
      if (!hasResult) {
        return (
          <StudentResultCircle status="none" label="Exercise not started" />
        );
      }
      const passed = getExerciseScore(studentItem) > 0;
      return (
        <StudentResultCircle
          status={passed ? 'pass' : 'fail'}
          label={passed ? 'Exercise passed' : 'Exercise failed'}
        />
      );
    }
    case 'assignment': {
      const hasRecordedAttempt =
        Boolean(studentItem.id) ||
        studentItem.nbgradesTotalScore !== undefined ||
        studentItem.nbgradesTotalPoints !== undefined ||
        Boolean(studentItem.nbgrades);
      if (!hasRecordedAttempt) {
        return (
          <StudentResultCircle status="none" label="Assignment not graded" />
        );
      }
      const totalScore = studentItem.nbgradesTotalScore ?? 0;
      const totalPoints = studentItem.nbgradesTotalPoints ?? 0;
      const nbgrades = Array.isArray(studentItem.nbgrades)
        ? studentItem.nbgrades
        : [];
      const status =
        totalPoints === 0
          ? 'pass'
          : totalScore <= 0
            ? 'fail'
            : totalScore >= totalPoints
              ? 'pass'
              : 'partial';
      const tooltip =
        nbgrades.length > 0
          ? `Assignment graded: ${totalScore} / ${totalPoints} (${nbgrades.length} checks)`
          : `Assignment graded: ${totalScore} / ${totalPoints}`;
      return <StudentResultCircle status={status} label={tooltip} />;
    }
    default:
      return <StudentResultCircle status="none" label="No result yet" />;
  }
};

export default StudentItemStatus;
