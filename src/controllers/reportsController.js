import { getAllReports, createReport, getReportById, updateReport, deleteReport } from '../services/reportsService.js';

// Get all reports
export async function getReports(req, res) {
  try {
    const reports = await getAllReports();
    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message: error.message
    });
  }
}

// Create new report
export async function createNewReport(req, res) {
  try {
    const report = await createReport(req.body);
    res.status(201).json(report);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      error: 'Failed to create report',
      message: error.message
    });
  }
}

// Get report by ID
export async function getReport(req, res) {
  try {
    const { id } = req.params;
    const report = await getReportById(id);
    
    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
        message: `Report with id ${id} not found`
      });
    }
    
    res.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      error: 'Failed to fetch report',
      message: error.message
    });
  }
}

// Update report
export async function updateReportById(req, res) {
  try {
    const { id } = req.params;
    console.log(`🔍 Updating report with ID: ${id}`);
    console.log(`🔍 Update data:`, req.body);
    
    const updated = await updateReport(id, req.body);
    
    if (!updated) {
      console.log(`⚠️ Report not found: ${id}`);
      return res.status(404).json({
        error: 'Report not found',
        message: `Report with id ${id} not found`
      });
    }
    
    console.log(`✅ Report updated successfully: ${id}`);
    res.json({ message: 'Report updated successfully' });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      error: 'Failed to update report',
      message: error.message
    });
  }
}

// Delete report
export async function deleteReportById(req, res) {
  try {
    const { id } = req.params;
    const deleted = await deleteReport(id);
    
    if (!deleted) {
      return res.status(404).json({
        error: 'Report not found',
        message: `Report with id ${id} not found`
      });
    }
    
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      error: 'Failed to delete report',
      message: error.message
    });
  }
} 