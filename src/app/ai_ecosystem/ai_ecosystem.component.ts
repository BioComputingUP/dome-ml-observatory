import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http'; // Import HttpClientModule
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Import FormsModule
import * as yaml from 'js-yaml'; // Import js-yaml

interface RegistryItem {
  name: string | null;
  description: string | null;
  url: string | null;
  'biotools-url': string | null;
  'fairsharing-url': string | null;
  'osai-recommendation': string | null;
  'osai-explanation': string | null;
  id: string | null;
}

@Component({
  selector: 'app-ai-ecosystem',
  templateUrl: './ai_ecosystem.html',
  // Add styleUrls if you have specific styles
  // styleUrls: ['./ai_ecosystem.component.css'] 
})
export class AiEcosystemComponent implements OnInit {
  
  searchTerm: string = '';
  selectedRecommendation: string = 'All'; // Default value
  
  originalData: RegistryItem[] = []; // Holds the raw data, now typed with updated RegistryItem
  filteredData: RegistryItem[] = []; // Holds the data displayed in the table
  
  availableRecommendations: string[] = ['All']; // Initialize with 'All'

  // Inject data service if needed
  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadData(); // Load data when the component initializes
  }

  loadData(): void {
    this.http.get('assets/ecosystem_components_list.yml', { responseType: 'text' })
      .subscribe(yamlText => {
        try {
          const data: any = yaml.load(yamlText);
          
          if (Array.isArray(data)) {
            this.originalData = data as RegistryItem[];
          } else if (data && typeof data === 'object' && data.hasOwnProperty('items') && Array.isArray(data.items)) {
            this.originalData = data.items as RegistryItem[];
          } else {
            let warningMessage = 'YAML data is not in the expected format. Expected an array or an object with an "items" array.';
            if (data === null || data === undefined) {
              warningMessage = 'Parsed YAML data is null or undefined. Check YAML file content.';
            }
            console.warn(warningMessage, 'Data loaded:', data);
            this.originalData = [];
          }

          // Populate recommendation filter dropdown dynamically
          this.availableRecommendations = ['All', ...new Set(this.originalData.map(item => item['osai-recommendation']).filter(Boolean) as string[])];

          this.applyFilters(); // Apply initial filters (which might be 'All')
        } catch (e) {
          console.error('Error parsing YAML:', e);
          this.originalData = []; // Set to empty array on error
          this.applyFilters();
        }
      }, error => {
        console.error('Error loading YAML file:', error);
        this.originalData = []; // Set to empty array on error
        this.applyFilters();
      });
  }

  applyFilters(): void {
    let data = [...this.originalData]; // Start with the original data

    // Filter by search term (case-insensitive) using available fields: name and description
    if (this.searchTerm) {
      const lowerSearchTerm = this.searchTerm.toLowerCase();
      data = data.filter(item => 
        (item.name && item.name.toLowerCase().includes(lowerSearchTerm)) ||
        (item.description && item.description.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Filter by recommendation using 'osai-recommendation'
    if (this.selectedRecommendation && this.selectedRecommendation !== 'All') {
      data = data.filter(item => item['osai-recommendation'] === this.selectedRecommendation);
    }

    this.filteredData = data; // Update the data bound to the table
  }
}
