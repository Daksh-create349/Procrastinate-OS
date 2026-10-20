import React from 'react';
import { ActionAuditHistoryView } from './ActionAuditHistoryView';

interface ActivityHistoryViewProps {
  folderPath: string;
}

export const ActivityHistoryView: React.FC<ActivityHistoryViewProps> = ({ folderPath }) => {
  return <ActionAuditHistoryView folderPath={folderPath} />;
};
