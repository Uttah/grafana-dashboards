import { apiRequestQAN } from '../../../react-plugins-deps/components/helpers/api';
import { getLabelQueryParams } from '../../panel/panel.tools';

class FiltersService {
  static async getQueryOverviewFiltersList(paramLabels, from, to, mainMetric) {
    const { labels } = await apiRequestQAN.post<any, any>('/Filters/Get', {
      labels: getLabelQueryParams(paramLabels),
      main_metric_name: mainMetric,
      period_start_from: from,
      period_start_to: to,
    });

    return markCheckedLabels(labels, paramLabels);
  }
}

const markCheckedLabels = (labels, paramLabels) => {
  Object.keys(labels).forEach(label => {
    labels[label].name.forEach(metric => {
      const passedVariables = paramLabels[label];
      metric.checked =
        passedVariables &&
        passedVariables.some(variable => {
          if (!metric.value) {
            metric.value = '';
          }
          return variable === metric.value;
        });
    });
  });

  return labels;
};

export default FiltersService;
