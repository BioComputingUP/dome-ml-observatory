import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http'; // Import HttpClientModule
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Import FormsModule

interface RegistryItem {
  Type: string | null;
  Name: string | null;
  Description: string | null;
  Recommendation: string | null;
  'Recommendation relevance': string | null; // Use quotes if key has spaces/special chars
  URL: string | null;
  'Bio.tools URL': string | null;
  'Access model': string | null;
}

@Component({
  selector: 'app-ai-ecosystem',
  templateUrl: './ai_ecosystem.html',
  // Add styleUrls if you have specific styles
  // styleUrls: ['./ai_ecosystem.component.css'] 
})
export class AiEcosystemComponent implements OnInit {
  
  searchTerm: string = '';
  selectedType: string = 'All'; // Default value
  selectedRecommendation: string = 'All'; // Default value
  
  originalData: any[] = []; // Holds the raw data
  filteredData: any[] = []; // Holds the data displayed in the table
  
  availableTypes: string[] = ['All']; // Initialize with 'All'
  availableRecommendations: string[] = ['All']; // Initialize with 'All'

  // Inject data service if needed
  // constructor(private dataService: DataService) {}
  constructor() {} // Placeholder constructor

  ngOnInit(): void {
    this.loadData(); // Load data when the component initializes
  }

  loadData(): void {
    // Placeholder for fetching data. Replace with actual data fetching logic.
    // Example: this.dataService.getEcosystemData().subscribe(data => { ... });
    this.originalData = [
      // Sample Data (replace with your actual data source)
      { Name: 'Tool A', Description: 'Does analysis A', Type: 'Software', Recommendation: 'Recommended', 'Recommendation relevance': 'High', URL: 'http://example.com/a', 'Bio.tools URL': 'http://bio.tools/a', 'Access model': 'Open Source' },
      { Name: 'Platform B', Description: 'Platform for B tasks', Type: 'Platform', Recommendation: 'Consider', 'Recommendation relevance': 'Medium', URL: 'http://example.com/b', 'Bio.tools URL': null, 'Access model': 'Commercial' },
      { Name: 'Service C', Description: 'Provides service C', Type: 'Service', Recommendation: 'Recommended', 'Recommendation relevance': 'High', URL: null, 'Bio.tools URL': 'http://bio.tools/c', 'Access model': 'Free' },
      { Name: 'Tool D', Description: 'Another analysis tool', Type: 'Software', Recommendation: 'Not Recommended', 'Recommendation relevance': 'Low', URL: 'http://example.com/d', 'Bio.tools URL': 'http://bio.tools/d', 'Access model': 'Open Source' },
    ];

    // Populate filter dropdowns dynamically
    this.availableTypes = ['All', ...new Set(this.originalData.map(item => item.Type).filter(Boolean))];
    this.availableRecommendations = ['All', ...new Set(this.originalData.map(item => item.Recommendation).filter(Boolean))];

    this.applyFilters(); // Apply initial filters (which might be 'All')
  }

  applyFilters(): void {
    let data = [...this.originalData]; // Start with the original data

    // Filter by search term (case-insensitive)
    if (this.searchTerm) {
      const lowerSearchTerm = this.searchTerm.toLowerCase();
      data = data.filter(item => 
        (item.Name && item.Name.toLowerCase().includes(lowerSearchTerm)) ||
        (item.Description && item.Description.toLowerCase().includes(lowerSearchTerm)) ||
        (item.Type && item.Type.toLowerCase().includes(lowerSearchTerm)) 
        // Add other fields to search if needed
      );
    }

    // Filter by type
    if (this.selectedType && this.selectedType !== 'All') {
      data = data.filter(item => item.Type === this.selectedType);
    }

    // Filter by recommendation
    if (this.selectedRecommendation && this.selectedRecommendation !== 'All') {
      data = data.filter(item => item.Recommendation === this.selectedRecommendation);
    }

    this.filteredData = data; // Update the data bound to the table
  }
}
