// Detect if the user is requesting a chart and determine the chart type
export function detectChartRequest(question) {
  const questionLower = question.toLowerCase();
  
  // Chart type detection patterns
  const chartPatterns = {
    'bar': [
      /\b(bar|bar chart|bar graph|bars)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(bar)\b/,
      /\b(visualize|visualise)\s+.*\b(bar)\b/
    ],
    'line': [
      /\b(line|line chart|line graph|trend|trends)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(line)\b/,
      /\b(visualize|visualise)\s+.*\b(line)\b/,
      /\b(over time|time series|timeline)\b/
    ],
    'pie': [
      /\b(pie|pie chart|pie graph|percentage|proportion|distribution)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(pie)\b/,
      /\b(visualize|visualise)\s+.*\b(pie)\b/,
      /\b(breakdown|composition|split)\b/
    ],
    'scatter': [
      /\b(scatter|scatter plot|scatter chart|correlation)\b/,
      /\b(show|display|create|generate|plot)\s+.*\b(scatter)\b/,
      /\b(visualize|visualise)\s+.*\b(scatter)\b/,
      /\b(relationship between|correlation between)\b/
    ]
  };
  
  // Check for chart keywords
  for (const [chartType, patterns] of Object.entries(chartPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(questionLower)) {
        return {
          type: chartType,
          requested: true,
          confidence: 'high'
        };
      }
    }
  }
  
  // Check for general visualization requests
  const vizKeywords = ['chart', 'graph', 'plot', 'visualize', 'visualise', 'diagram'];
  for (const keyword of vizKeywords) {
    if (questionLower.includes(keyword)) {
      // Default to bar chart for general visualization requests
      return {
        type: 'bar',
        requested: true,
        confidence: 'medium'
      };
    }
  }
  
  return {
    type: null,
    requested: false,
    confidence: 'none'
  };
}

// Generate chart data from SQL results
export function generateChartData(results, chartType) {
  if (!results || results.length === 0) {
    return null;
  }
  
  try {
    // Get column names from first result
    const columns = Object.keys(results[0]);
    
    if (columns.length < 2) {
      return null;
    }
    
    // For bar, line, and pie charts, we need at least 2 columns
    if (['bar', 'line', 'pie'].includes(chartType)) {
      if (columns.length < 2) {
        return null;
      }
      
      // Use first column as labels/categories, second as values
      const labelCol = columns[0];
      const valueCol = columns[1];
      
      // Check if value column contains numeric data
      const numericValues = [];
      const labels = [];
      
      for (const row of results) {
        try {
          const value = parseFloat(row[valueCol]);
          if (!isNaN(value)) {
            numericValues.push(value);
            labels.push(String(row[labelCol]));
          }
        } catch (error) {
          continue;
        }
      }
      
      if (numericValues.length === 0) {
        return null;
      }
      
      if (chartType === 'bar') {
        return {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: valueCol,
              data: numericValues,
              backgroundColor: 'rgba(59, 130, 246, 0.8)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: `${valueCol} by ${labelCol}`
              }
            }
          }
        };
      }
      
      else if (chartType === 'line') {
        return {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: valueCol,
              data: numericValues,
              borderColor: 'rgba(59, 130, 246, 1)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: `${valueCol} over ${labelCol}`
              }
            }
          }
        };
      }
      
      else if (chartType === 'pie') {
        return {
          type: 'pie',
          data: {
            labels: labels,
            datasets: [{
              data: numericValues,
              backgroundColor: [
                'rgba(59, 130, 246, 0.8)',
                'rgba(147, 51, 234, 0.8)',
                'rgba(236, 72, 153, 0.8)',
                'rgba(34, 197, 94, 0.8)',
                'rgba(251, 146, 60, 0.8)'
              ]
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: `Distribution of ${valueCol}`
              }
            }
          }
        };
      }
    }
    
    else if (chartType === 'scatter') {
      if (columns.length < 3) {
        return null;
      }
      
      // For scatter plot, we need at least 3 columns: x, y, and optionally label
      const xCol = columns[0];
      const yCol = columns[1];
      const labelCol = columns.length > 2 ? columns[2] : null;
      
      const points = [];
      for (const row of results) {
        try {
          const x = parseFloat(row[xCol]);
          const y = parseFloat(row[yCol]);
          if (!isNaN(x) && !isNaN(y)) {
            const point = { x: x, y: y };
            if (labelCol) {
              point.label = String(row[labelCol]);
            }
            points.push(point);
          }
        } catch (error) {
          continue;
        }
      }
      
      if (points.length === 0) {
        return null;
      }
      
      return {
        type: 'scatter',
        data: {
          datasets: [{
            label: `${yCol} vs ${xCol}`,
            data: points,
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: 'rgba(59, 130, 246, 1)',
            pointRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: `${yCol} vs ${xCol}`
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: xCol
              }
            },
            y: {
              title: {
                display: true,
                text: yCol
              }
            }
          }
        }
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Error generating chart data:', error);
    return null;
  }
} 