import { getMongoClient, MONGODB_DB_NAME } from '../config/database.js';
import { safeDateToISO } from '../utils/helpers.js';

// Get all reports
export async function getAllReports() {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const reports = await db.collection('reports').find({}).sort({ created_at: -1 }).toArray();
    
    const formattedReports = reports.map(report => ({
      ...report,
      _id: report._id.toString(),
      id: report.id || report._id.toString(), // Ensure ID is available
      created_at: safeDateToISO(report.created_at),
      updated_at: safeDateToISO(report.updated_at)
    }));
    
    return formattedReports;
  } catch (error) {
    console.error('Error fetching reports:', error);
    throw error;
  }
}

// Create new report
export async function createReport(reportData) {
  try {
    const report = {
      ...reportData,
      id: reportData.id || Date.now().toString(), // Ensure ID is set
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const result = await db.collection('reports').insertOne(report);
    
    const createdReport = {
      ...report,
      _id: result.insertedId.toString(),
      id: report.id, // Keep the original ID
      created_at: report.created_at.toISOString(),
      updated_at: report.updated_at.toISOString()
    };
    
    return createdReport;
  } catch (error) {
    console.error('Error creating report:', error);
    throw error;
  }
}

// Get report by ID
export async function getReportById(id) {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const report = await db.collection('reports').findOne({ id });
    
    if (!report) {
      return null;
    }
    
    return {
      ...report,
      _id: report._id.toString(),
      created_at: safeDateToISO(report.created_at),
      updated_at: safeDateToISO(report.updated_at)
    };
  } catch (error) {
    console.error('Error fetching report:', error);
    throw error;
  }
}

// Update report
export async function updateReport(id, updateData) {
  try {
    console.log(`🔍 Updating report in service: ${id}`);
    console.log(`🔍 Update data:`, updateData);
    
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    
    // First check if report exists
    const existingReport = await db.collection('reports').findOne({ id });
    console.log(`🔍 Existing report found:`, existingReport ? 'Yes' : 'No');
    
    // Remove _id from updateData to avoid MongoDB error
    const { _id, ...updateDataWithoutId } = updateData;
    console.log(`🔍 Update data without _id:`, updateDataWithoutId);
    
    const result = await db.collection('reports').updateOne(
      { id },
      { $set: { ...updateDataWithoutId, updated_at: new Date() } }
    );
    
    console.log(`🔍 Update result:`, result);
    console.log(`🔍 Matched count: ${result.matchedCount}, Modified count: ${result.modifiedCount}`);
    
    return result.matchedCount > 0;
  } catch (error) {
    console.error('Error updating report:', error);
    throw error;
  }
}

// Delete report
export async function deleteReport(id) {
  try {
    const mongo = await getMongoClient();
    const db = mongo.db(MONGODB_DB_NAME);
    const result = await db.collection('reports').deleteOne({ id });
    
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Error deleting report:', error);
    throw error;
  }
} 