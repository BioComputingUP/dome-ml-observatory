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
  type: string | null; // Added type
  'access-model': string | null; // Added access-model
}

@Component({
  selector: 'app-ai-ecosystem',
  templateUrl: './ai_ecosystem.html',
  // Add styleUrls if you have specific styles
  // styleUrls: ['./ai_ecosystem.component.css'] 
})
export class AiEcosystemComponent implements OnInit {
  
  searchTerm: string = '';
  selectedType: string = 'All'; // Added for Type filter
  selectedRecommendation: string = 'All'; 
  
  originalData: RegistryItem[] = []; 
  filteredData: RegistryItem[] = []; 
  
  availableTypes: string[] = ['All']; // Added for Type filter
  availableRecommendations: string[] = ['All', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']; // Hardcoded list

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

          // Populate type filter dropdown dynamically
          this.availableTypes = ['All', ...new Set(this.originalData.map(item => item.type).filter(Boolean) as string[])].sort((a, b) => {
            if (a === 'All') return -1;
            if (b === 'All') return 1;
            return a.localeCompare(b);
          });
          // Dynamic population of availableRecommendations removed as it's now hardcoded.

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

    // Filter by search term (case-insensitive) using available fields: name, description, and type
    if (this.searchTerm) {
      const lowerSearchTerm = this.searchTerm.toLowerCase();
      data = data.filter(item => 
        (item.name && item.name.toLowerCase().includes(lowerSearchTerm)) ||
        (item.description && item.description.toLowerCase().includes(lowerSearchTerm)) ||
        (item.type && item.type.toLowerCase().includes(lowerSearchTerm)) // Added type to search
      );
    }

    // Filter by type
    if (this.selectedType && this.selectedType !== 'All') {
      data = data.filter(item => item.type === this.selectedType);
    }

    // Filter by recommendation using 'osai-recommendation'
    if (this.selectedRecommendation && this.selectedRecommendation !== 'All') {
      data = data.filter(item => {
        if (item['osai-recommendation']) {
          // Check if the item's recommendation string contains the selected recommendation as a whole word/token.
          // This handles cases like "R2" in "R2, R5" or "R12" not matching "R1" or "R2".
          const itemRecs = item['osai-recommendation'].split(',').map(rec => rec.trim());
          return itemRecs.includes(this.selectedRecommendation);
        }
        return false; // If item has no recommendation, it doesn't match a specific one
      });
    }

    this.filteredData = data; // Update the data bound to the table
  }
}
